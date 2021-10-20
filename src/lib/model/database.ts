import { Downloader, DownloadLogger } from "../io/downloader/downloader.js";
import { EntityKind } from "../io/hubspot.js";
import { Uploader } from "../io/uploader/uploader.js";
import { MultiDownloadLogger } from "../log/download-logger.js";
import log from "../log/logger.js";
import { makeMultiProviderDomainsSet } from "../services/domains.js";
import { Company } from "../types/company.js";
import { Contact } from "../types/contact.js";
import { Deal } from "../types/deal.js";
import { License } from "../types/license.js";
import { Transaction } from "../types/transaction.js";
import { CompanyManager } from "./hubspot/company.js";
import { ContactManager } from "./hubspot/contact.js";
import { DealManager } from "./hubspot/deal.js";
import { Entity } from "./hubspot/entity.js";
import { License as NormalizedLicense, normalizeLicense } from "./marketplace/license.js";
import { normalizeTransaction, Transaction as NormalizedTransaction } from "./marketplace/transaction.js";
import { validateMarketplaceData } from "./marketplace/validation.js";

export class Database {

  dealManager: DealManager;
  contactManager: ContactManager;
  companyManager: CompanyManager;

  licenses: NormalizedLicense[] = [];
  transactions: NormalizedTransaction[] = [];

  allLicenses: License[] = [];
  allTransactions: Transaction[] = [];

  allCompanies: Company[] = [];
  allContacts: Contact[] = [];
  allDeals: Deal[] = [];

  /** Domains that provide spam or free email accounts for masses. */
  providerDomains = new Set<string>();
  partnerDomains = new Set<string>();
  customerDomains = new Set<string>();

  constructor(private downloader: Downloader, uploader: Uploader) {
    this.dealManager = new DealManager(downloader, uploader, this);
    this.contactManager = new ContactManager(downloader, uploader, this);
    this.companyManager = new CompanyManager(downloader, uploader, this);
  }

  async downloadAllData() {
    log.info('Downloader', 'Starting downloads with API');

    const multiDownloadLogger = new MultiDownloadLogger();

    let [
      freeDomains,
      licensesWithDataInsights,
      licensesWithoutDataInsights,
      allTransactions,
      allContacts,
      allDeals,
      allCompanies,
      allTlds,
    ] = await Promise.all([
      this.downloader.downloadFreeEmailProviders(multiDownloadLogger.makeDownloadLogger('Free Email Providers')),
      this.downloader.downloadLicensesWithDataInsights(multiDownloadLogger.makeDownloadLogger('Licenses With Data Insights')),
      this.downloader.downloadLicensesWithoutDataInsights(multiDownloadLogger.makeDownloadLogger('Licenses Without Data Insights')),
      this.downloader.downloadTransactions(multiDownloadLogger.makeDownloadLogger('Transactions')),
      this.downloader.downloadAllContacts(multiDownloadLogger.makeDownloadLogger('Contacts')),
      this.downloader.downloadAllDeals(multiDownloadLogger.makeDownloadLogger('Deals')),
      this.downloader.downloadAllCompanies(multiDownloadLogger.makeDownloadLogger('Companies')),
      this.downloader.downloadAllTlds(multiDownloadLogger.makeDownloadLogger('Tlds')),
    ]);

    await Promise.all([
      this.downloadAllCompanies(multiDownloadLogger.makeDownloadLogger('DB-Companies')),
      this.downloadAllContacts(multiDownloadLogger.makeDownloadLogger('DB-Contacts')),
      this.downloadAllDeals(multiDownloadLogger.makeDownloadLogger('DB-Deals')),
    ]);

    multiDownloadLogger.done();

    log.info('Downloader', 'Done');

    this.providerDomains = makeMultiProviderDomainsSet(freeDomains);

    const emailRe = makeEmailValidationRegex(allTlds);
    const results = validateMarketplaceData(
      licensesWithDataInsights,
      licensesWithoutDataInsights,
      allTransactions,
      emailRe);

    this.allLicenses = results.allLicenses;
    this.allTransactions = results.allTransactions;

    this.licenses = results.allLicenses.map(normalizeLicense);
    this.transactions = results.allTransactions.map(normalizeTransaction);

    this.allDeals = allDeals;
    this.allCompanies = allCompanies;
    this.allContacts = allContacts;
  }

  async downloadAllDeals(downloadLogger: DownloadLogger) {
    downloadLogger.prepare(1);
    await this.dealManager.downloadAllEntities();
    downloadLogger.tick();
  }

  async downloadAllContacts(downloadLogger: DownloadLogger) {
    downloadLogger.prepare(1);
    await this.contactManager.downloadAllEntities();
    downloadLogger.tick();
  }

  async downloadAllCompanies(downloadLogger: DownloadLogger) {
    downloadLogger.prepare(1);
    await this.companyManager.downloadAllEntities();
    downloadLogger.tick();
  }

  getEntity(kind: EntityKind, id: string): Entity<any> {
    const found = this.getManager(kind).get(id);
    // There's only two ways to set associations:
    // 1. They were already set in HubSpot when we downloaded them, or
    // 2. We set them in code with an object already having a valid id.
    // In either case, an invalid id would fail before this method.
    if (!found) throw new Error(`Expected to find ${kind} with id ${id}`);
    return found;
  }

  private getManager(kind: EntityKind) {
    switch (kind) {
      case 'deal': return this.dealManager;
      case 'company': return this.companyManager;
      case 'contact': return this.contactManager;
    }
  }

}

function makeEmailValidationRegex(tlds: string[]) {
  return new RegExp(`.+@.+\\.(${tlds.join('|')})`);
}
