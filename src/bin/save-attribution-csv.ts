import 'source-map-support/register';
import { engineConfigFromENV } from '../lib/config/env';
import { dataManager } from '../lib/data/manager';
import { dataSetConfigFromENV } from '../lib/data/set';
import { Engine } from "../lib/engine";
import { isPresent, sorter } from "../lib/util/helpers";

const { data, dataSet } = dataManager.latestDataSet(dataSetConfigFromENV());
const logDir = dataSet.makeLogDir!(`inspect-${Date.now()}`);
const engine = new Engine(dataSet, engineConfigFromENV());
engine.run(data);

const attributions = (engine
  .mpac.licenses
  .map(l => l.data.attribution)
  .filter(isPresent)
  .sort(sorter(a => [
    Object.keys(a).length,
    a.channel,
    a.referrerDomain,
  ].join(',')))
);

logDir.attributionsLog()!.writeArray(attributions.map(a => ({
  channel: a.channel,
  referrerDomain: a.referrerDomain,
  campaignName: a.campaignName,
  campaignSource: a.campaignSource,
  campaignMedium: a.campaignMedium,
  campaignContent: a.campaignContent,
})));
