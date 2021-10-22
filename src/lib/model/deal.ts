import { DealStage, Pipeline } from "../config/dynamic-enums.js";
import config from "../config/index.js";
import { EntityKind } from "../io/hubspot.js";
import { Company } from "./company.js";
import { Contact } from "./contact.js";
import { Entity } from "./hubspot/entity.js";
import { EntityManager, PropertyTransformers } from "./hubspot/manager.js";

const addonLicenseIdKey = config.hubspot.attrs.deal.addonLicenseId;
const transactionIdKey = config.hubspot.attrs.deal.transactionId;
const appKey = config.hubspot.attrs.deal.app;

export type DealData = {
  relatedProducts: string;
  app: string;
  addonLicenseId: string | null;
  transactionId: string | null;
  closeDate: string;
  country: string;
  dealName: string;
  origin: string;
  deployment: 'Server' | 'Cloud' | 'Data Center';
  licenseTier: number;
  pipeline: Pipeline;
  dealstage: DealStage;
  amount: number | null;
};

export class Deal extends Entity<DealData> {

  contacts = this.makeDynamicAssociation<Contact>('contact');
  companies = this.makeDynamicAssociation<Company>('company');

  isEval() { return this.data.dealstage === DealStage.EVAL; }
  isClosed() {
    return (
      this.data.dealstage === DealStage.CLOSED_LOST ||
      this.data.dealstage === DealStage.CLOSED_WON
    );
  }

}

export class DealManager extends EntityManager<DealData, Deal> {

  override Entity = Deal;
  override kind: EntityKind = "deal";

  override associations: EntityKind[] = [
    "company",
    "contact",
  ];

  override apiProperties: string[] = [
    'closedate',
    'deployment',
    addonLicenseIdKey,
    transactionIdKey,
    appKey,
    'license_tier',
    'country',
    'origin',
    'related_products',
    'dealname',
    'dealstage',
    'pipeline',
    'amount',
  ];

  override fromAPI(data: { [key: string]: string | null }): DealData | null {
    if (data.pipeline !== Pipeline.AtlassianMarketplace) return null;
    return {
      relatedProducts: data.related_products as string,
      app: data[appKey] as string,
      addonLicenseId: data[addonLicenseIdKey],
      transactionId: data[transactionIdKey],
      closeDate: (data.closedate as string).substr(0, 10),
      country: data.country as string,
      dealName: data.dealname as string,
      origin: data.origin as DealData['origin'],
      deployment: data.deployment as DealData['deployment'],
      licenseTier: +(data.license_tier as string),
      pipeline: data.pipeline,
      dealstage: data.dealstage as string,
      amount: !data.amount ? null : +data.amount,
    };
  }

  override toAPI: PropertyTransformers<DealData> = {
    relatedProducts: relatedProducts => ['related_products', relatedProducts],
    app: app => [appKey, app],
    addonLicenseId: addonLicenseId => [addonLicenseIdKey, addonLicenseId || ''],
    transactionId: transactionId => [transactionIdKey, transactionId || ''],
    closeDate: closeDate => ['closedate', closeDate],
    country: country => ['country', country],
    dealName: dealName => ['dealname', dealName],
    origin: origin => ['origin', origin],
    deployment: deployment => ['deployment', deployment],
    licenseTier: licenseTier => ['license_tier', licenseTier.toFixed()],
    pipeline: pipeline => ['pipeline', pipeline],
    dealstage: dealstage => ['dealstage', dealstage],
    amount: amount => ['amount', amount?.toString() ?? ''],
  };

  override identifiers: (keyof DealData)[] = [
    'addonLicenseId',
    'transactionId',
  ];

  private dealsByAddonLicenseId = new Map<string, Deal>();
  private dealsByTransactionId = new Map<string, Deal>();

  getByAddonLicenseId(id: string) {
    return this.dealsByAddonLicenseId.get(id);
  }

  getByTransactionId(id: string) {
    return this.dealsByTransactionId.get(id);
  }

  override addIndexes(deals: Iterable<Deal>, full: boolean) {
    if (full) {
      this.dealsByAddonLicenseId.clear();
      this.dealsByTransactionId.clear();
    }
    for (const deal of deals) {
      if (deal.data.addonLicenseId) {
        this.dealsByAddonLicenseId.set(deal.data.addonLicenseId, deal);
      }
      if (deal.data.transactionId) {
        this.dealsByTransactionId.set(deal.data.transactionId, deal);
      }
    }
  }

}
