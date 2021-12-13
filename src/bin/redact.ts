import Chance from 'chance';
import 'source-map-support/register';
import DataDir from '../lib/cache/datadir';
import { IO } from "../lib/io/io";
import { Database } from "../lib/model/database";
import { License } from '../lib/model/license';
import { ContactInfo, PartnerInfo } from '../lib/model/marketplace/common';
import { Transaction } from '../lib/model/transaction';


async function main() {

  const db = new Database(new IO({ in: 'local', out: 'local' }));
  await db.downloadAllData();

  const scores = DataDir.cache.file('scorer.json').readJson();
  const redactedScores = redactCachedScores(scores as Scores);
  DataDir.out.file('redacted-scorer.json').writeJson(redactedScores);

  const redactedTransactions = db.transactions.map(t => redactedTransaction(t));
  DataDir.out.file('redacted-transactions.json').writeJson(redactedTransactions);

  const redactedLicenses = db.licenses.map(l => redactedLicense(l));
  DataDir.out.file('redacted-licenses.json').writeJson(redactedLicenses);

}


function redactCachedScores(s: Scores): Scores {
  return {
    maybeMatches: s.maybeMatches.map(m => ({
      item1: Redact.licenseId(m.item1),
      item2: Redact.licenseId(m.item2),
      score: m.score,
      reasons: m.reasons,
    })),
    unaccounted: s.unaccounted.map(id =>
      Redact.licenseId(id))
  };
}

function redactedLicense(t: License): License {
  return new License({
    addonLicenseId: Redact.licenseId(t.data.addonLicenseId),
    licenseId: Redact.licenseId(t.data.licenseId),
    addonKey: Redact.addonKey(t.data.addonKey),
    addonName: Redact.addonName(t.data.addonName),
    lastUpdated: t.data.lastUpdated,

    technicalContact: redactContactInfo(t.data.technicalContact),
    billingContact: maybeRedactContactInfo(t.data.billingContact),
    partnerDetails: redactPartnerDetails(t.data.partnerDetails),

    company: Redact.company(t.data.company),
    country: Redact.country(t.data.country),
    region: Redact.region(t.data.region),

    tier: 'Unlimited Users',
    licenseType: t.data.licenseType,
    hosting: t.data.hosting,
    maintenanceStartDate: t.data.maintenanceStartDate,
    maintenanceEndDate: t.data.maintenanceEndDate,

    status: t.data.status,

    evaluationOpportunitySize: 'NA',
    attribution: null,
    parentInfo: null,
    newEvalData: null,
  });
}

function redactedTransaction(t: Transaction): Transaction {
  return new Transaction({
    addonLicenseId: Redact.licenseId(t.data.addonLicenseId),
    licenseId: Redact.licenseId(t.data.licenseId),
    addonKey: Redact.addonKey(t.data.addonKey),
    addonName: Redact.addonName(t.data.addonName),
    lastUpdated: t.data.lastUpdated,

    technicalContact: redactContactInfo(t.data.technicalContact),
    billingContact: maybeRedactContactInfo(t.data.billingContact),
    partnerDetails: redactPartnerDetails(t.data.partnerDetails),

    company: Redact.company(t.data.company),
    country: Redact.country(t.data.country),
    region: Redact.region(t.data.region),

    tier: 'Unlimited Users',
    licenseType: t.data.licenseType,
    hosting: t.data.hosting,
    maintenanceStartDate: t.data.maintenanceStartDate,
    maintenanceEndDate: t.data.maintenanceEndDate,

    transactionId: Redact.transactionId(t.data.transactionId),
    saleDate: t.data.saleDate,
    saleType: t.data.saleType,

    billingPeriod: t.data.billingPeriod,

    purchasePrice: Redact.amount(t.data.purchasePrice),
    vendorAmount: Redact.amount(t.data.vendorAmount),
  });
}

const Redact = {

  transactionId: makeRedactor<string>((old, chance) => {
    return `AT-${chance.integer({ min: 10000000, max: 999999999 })}`;
  }),

  licenseId: makeRedactor<string>((old, chance) => {
    const SEN = old.startsWith('SEN-') ? 'SEN-' : '';
    old = old.replace(/^SEN-/, '');
    const L = old.startsWith('L') ? 'L' : '';
    const number = chance.integer({ min: 10000000, max: 99999999 });
    return `${SEN}${L}${number}`;
  }),

  amount: makeRedactor<number>((old, chance) => {
    return chance.integer({ min: 1, max: 1000 });
  }, false),

  addonKey: makeRedactor<string>((old, chance) => {
    return chance.word({ capitalize: false });
  }),

  addonName: makeRedactor<string>((old, chance) => {
    return chance.word({ capitalize: true });
  }),

  company: makeRedactor<string>((old, chance) => {
    return chance.company();
  }),

  country: makeRedactor<string>((old, chance) => {
    return chance.country();
  }),

  region: makeRedactor<string>((old, chance) => {
    return chance.pickone(['EMEA', 'Americas', 'APAC', 'Unknown']);
  }),

  name: makeRedactor<string>((old, chance) => {
    return chance.name();
  }),

  email: makeRedactor<string>((old, chance) => {
    return chance.email();
  }),

};

function redactPartnerDetails(info: PartnerInfo | null): PartnerInfo | null {
  return (info
    ? {
      billingContact: {
        email: Redact.email(info.billingContact.email),
        name: Redact.email(info.billingContact.name),
      },
      partnerName: Redact.name(info.partnerName),
      partnerType: info.partnerType,
    } : null);
}

function makeRedactor<T>(fn: (old: T, chance: Chance.Chance) => T, mustBeUnique = true) {
  const chance = new Chance();
  const redactions = new Map<T, T>();
  return (old: T): T => {
    if (!old) return old;
    let redacted = redactions.get(old);
    if (redacted === undefined) {
      do { redacted = fn(old, chance); }
      while (mustBeUnique && redactions.has(redacted));
      redactions.set(old, redacted);
    }
    return redacted;
  };
}

function redactContactInfo(contact: ContactInfo): ContactInfo {
  return {
    email: Redact.email(contact.email),
    name: (contact.name
      ? Redact.name(contact.name)
      : contact.name),
  };
}

function maybeRedactContactInfo(contact: ContactInfo | null): ContactInfo | null {
  return (contact
    ? redactContactInfo(contact)
    : null);
}

type Scores = {
  maybeMatches: {
    item1: string;
    item2: string;
    score: number;
    reasons: string[];
  }[];
  unaccounted: string[];
};

main();
