import { use$ } from "@legendapp/state/react";
import {
  getObservableDataForKey,
  observableDataSyncState,
} from "./ObservableData";

function useOnyx(
  key: string,
  { selector }: { selector?: (value: any) => any } = {}
) {
  const observableData = getObservableDataForKey(key);

  const data = use$(() => {
    if (selector) {
      return selector(observableData.get());
    }

    return observableData.get();
  });

  const isPersistLoaded = use$(observableDataSyncState.isPersistLoaded);

  return [data, { status: isPersistLoaded ? "loaded" : "loading" }];
}

export default useOnyx;
