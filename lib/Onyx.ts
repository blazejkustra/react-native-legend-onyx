/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  beginBatch,
  endBatch,
  mergeIntoObservable,
  observe,
  when,
} from "@legendapp/state";
import { registerLogger } from "./Logger";
import observableData, {
  getObservableDataForKey,
  observableDataSyncState,
} from "./ObservableData";
import { METHOD } from "./OnyxUtils";

let defaultKeyStates: Record<string, any> = {};
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let isBatching = false;

function startBatch() {
  if (!isBatching) {
    beginBatch();
    isBatching = true;
  }
}

function scheduleBatchEnd() {
  if (batchTimeout) {
    clearTimeout(batchTimeout);
  }

  batchTimeout = setTimeout(() => {
    if (isBatching) {
      endBatch();
      isBatching = false;
    }
  }, 50);
}

function connect({
  key,
  callback,
}: {
  key: string;
  callback: (value: any, key: string) => void;
}) {
  const disconnect = observe(getObservableDataForKey(key), (e) => {
    callback(e.value, key);
  });

  return { disconnect };
}

function disconnect(connection: { disconnect: () => void }) {
  connection?.disconnect?.();
}

async function set(key: string, value: any) {
  try {
    startBatch();
    if (value === null) {
      return getObservableDataForKey(key).delete();
    }

    getObservableDataForKey(key).set(value);
  } finally {
    scheduleBatchEnd();
  }
}

async function multiSet(values: Record<string, any>) {
  try {
    beginBatch();
    for (const [key, value] of Object.entries(values)) {
      set(key, value);
    }
  } finally {
    scheduleBatchEnd();
  }
}

async function merge(key: string, value: any) {
  try {
    startBatch();
    if (value === null) {
      return getObservableDataForKey(key).delete();
    }

    mergeIntoObservable(getObservableDataForKey(key), value);
  } finally {
    scheduleBatchEnd();
  }
}

async function mergeCollection(key: string, values: Record<string, any>) {
  try {
    beginBatch();
    merge(key, values);
  } finally {
    scheduleBatchEnd();
  }
}

async function setCollection(key: string, values: Record<string, any>) {
  try {
    beginBatch();
    getObservableDataForKey(key).set(values);
  } finally {
    scheduleBatchEnd();
  }
}

async function update(
  updates: {
    onyxMethod: (typeof METHOD)[keyof typeof METHOD];
    key: string;
    value: any;
  }[]
) {
  try {
    endBatch();
    startBatch();
    for (const { onyxMethod, key, value } of updates) {
      switch (onyxMethod) {
        case METHOD.SET:
          set(key, value);
          break;
        case METHOD.MERGE:
          merge(key, value);
          break;
        case METHOD.MERGE_COLLECTION:
          mergeCollection(key, value);
          break;
        case METHOD.SET_COLLECTION:
          setCollection(key, value);
          break;
        case METHOD.MULTI_SET:
          multiSet(value);
          break;
        case METHOD.CLEAR:
          clear();
          break;
        default:
          throw new Error(`Invalid onyx method: ${onyxMethod}`);
      }
    }
  } finally {
    endBatch();
  }
}

async function clear() {
  observableData.set(JSON.parse(JSON.stringify(defaultKeyStates)));
}

async function init({
  keys = {},
  initialKeyStates = {},
}: {
  keys: Record<string, any>;
  initialKeyStates: Record<string, any>;
}) {
  defaultKeyStates = initialKeyStates;

  when(observableDataSyncState.isPersistLoaded, () => {
    if (Object.keys(observableData.get()).length === 0) {
      observableData.set(JSON.parse(JSON.stringify(defaultKeyStates)));
    }
  });
}

async function get(key: string) {
  return getObservableDataForKey(key).get();
}

const Onyx = {
  METHOD,
  connect,
  disconnect,
  set,
  multiSet,
  merge,
  mergeCollection,
  setCollection,
  update,
  clear,
  init,
  registerLogger,
  get,
};

(globalThis as any).Onyx = Onyx;
(globalThis as any).onyxData = observableData;

export default Onyx;

// TODO:
// - Evictable keys
// - Snapshots
// - persistence
// - [isOnyxMigrated, setIsOnyxMigrated] = useState(true);
// - disconnect inside of connect // treat it as an anti pattern
