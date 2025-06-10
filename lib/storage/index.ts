import { observable } from "@legendapp/state";
import { configureSynced } from "@legendapp/state/sync";
import { observablePersistIndexedDB } from "./indexedDB";
import { OnyxData } from "./types";

const persistOptions = configureSynced({
  persist: {
    plugin: observablePersistIndexedDB({
      databaseName: "react-native-legend-onyx",
      version: 1,
      tableNames: ["legend-onyx"],
    }),
  },
});

const observableData = observable<OnyxData>(
  persistOptions({
    initial: {},
    persist: {
      name: "legend-onyx",
    },
  })
);

export default observableData;
