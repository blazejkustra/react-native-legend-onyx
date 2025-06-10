import { observable } from "@legendapp/state";
import { ObservablePersistMMKV } from "@legendapp/state/persist-plugins/mmkv";
import { synced } from "@legendapp/state/sync";
import { OnyxData } from "./types";

const observableData = observable<OnyxData>(
  synced({
    initial: {},
    persist: {
      name: "legend-onyx",
      plugin: ObservablePersistMMKV,
    },
  })
);

export default observableData;
