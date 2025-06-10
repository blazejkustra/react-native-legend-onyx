import { syncState } from "@legendapp/state";
import observableData from "./storage";

function getObservableDataForKey(key: string) {
  if (key.includes("_") && !key.endsWith("_")) {
    const [collectionKey, itemKey] = key.split("_");
    return observableData[`${collectionKey}_`][`${collectionKey}_${itemKey}`];
  }

  return observableData[key];
}

const observableDataSyncState = syncState(observableData);

export default observableData;
export { getObservableDataForKey, observableDataSyncState };
