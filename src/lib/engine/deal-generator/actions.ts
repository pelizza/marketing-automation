import { Deal } from '../../types/deal.js';
import { License, LicenseContext } from '../../types/license.js';
import { Transaction } from '../../types/transaction.js';
import { DealStage } from '../../util/config/index.js';
import { isPresent, sorter } from '../../util/helpers.js';
import { DealFinder } from './deal-finder.js';
import { DealRelevantEvent, EvalEvent, PurchaseEvent, RefundEvent, RenewalEvent, UpgradeEvent } from "./events.js";
import { dealCreationProperties, dealUpdateProperties, getDate } from './records.js';

export class ActionGenerator {

  constructor(private dealFinder: DealFinder) {
  }

  generateFrom(events: DealRelevantEvent[]) {
    return events.flatMap(event => this.actionsFor(event));
  }

  private actionsFor(event: DealRelevantEvent): Action[] {
    switch (event.type) {
      case 'eval': {
        const action = this.actionForEval(event);
        return action ? [action] : [];
      }
      case 'purchase': {
        const action = this.actionForPurchase(event);
        return action ? [action] : [];
      }
      case 'renewal': return [this.actionForRenewal(event)];
      case 'upgrade': return [this.actionForRenewal(event)];
      case 'refund': return this.actionForRefund(event);
    }
  }

  private actionForEval(event: EvalEvent): Action | null {
    const deal = this.dealFinder.getDeal(event.licenses);
    const latestLicense = event.licenses[event.licenses.length - 1];
    if (!deal) {
      return makeCreateAction(event, latestLicense, DealStage.EVAL);
    }
    else if (deal.properties.dealstage === DealStage.EVAL) {
      return makeUpdateAction(event, deal, latestLicense, {});
    }
    else {
      return null;
    }
  }

  private actionForPurchase(event: PurchaseEvent): Action | null {
    const deal = (
      // Either it is an eval or a purchase without a transaction,
      this.dealFinder.getDeal(event.licenses) ||
      // or it exists as a purchase with a transaction
      this.dealFinder.getDeal(event.transaction
        ? [event.transaction]
        : [])
    );

    const record = getLatestRecord(event);
    if (!deal) {
      return makeCreateAction(event, record, DealStage.CLOSED_WON);
    }
    else if (deal.properties.dealstage === DealStage.EVAL) {
      return makeUpdateAction(event, deal, record, { dealstage: DealStage.CLOSED_WON });
    }
    else {
      return null;
    }
  }

  private actionForRenewal(event: RenewalEvent | UpgradeEvent): Action {
    return makeCreateAction(event, event.transaction, DealStage.CLOSED_WON);
  }

  private actionForRefund(event: RefundEvent): Action[] {
    const deals = this.dealFinder.getDeals(event.refundedTxs);
    return (deals
      .filter(deal => deal.properties.dealstage !== DealStage.CLOSED_LOST)
      .map(deal => {
        return makeUpdateAction(event, deal, null, { dealstage: DealStage.CLOSED_LOST })
      })
      .filter(isPresent)
    );
  }

}

type Action = (
  { type: 'update', groups: LicenseContext[], deal: Deal, properties: Partial<Deal['properties']> } |
  { type: 'create', groups: LicenseContext[], properties: Deal['properties'] }
);

function makeCreateAction(event: DealRelevantEvent, record: License | Transaction, dealstage: DealStage): Action {
  return {
    type: 'create',
    groups: event.groups,
    properties: dealCreationProperties(record, dealstage),
  };
}

function makeUpdateAction(event: DealRelevantEvent, deal: Deal, record: License | Transaction | null, properties: Partial<Deal['properties']>): Action | null {
  const combinedProperties = (record ? dealUpdateProperties(deal, record) : {});
  Object.assign(combinedProperties, properties);

  if (Object.keys(combinedProperties).length === 0) return null;

  return {
    type: 'update',
    groups: event.groups,
    deal,
    properties: combinedProperties,
  };
}

function getLatestRecord(event: PurchaseEvent): License | Transaction {
  const records: (License | Transaction)[] = [...event.licenses];
  if (event.transaction) records.push(event.transaction);
  return records.sort(sorter(getDate, 'DSC'))[0];
}
