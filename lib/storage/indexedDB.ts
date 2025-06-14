import type { Change, Observable } from "@legendapp/state";
import { isPromise, observable, setAtPath, when } from "@legendapp/state";
import type {
  ObservablePersistIndexedDBPluginOptions,
  ObservablePersistPlugin,
  ObservablePersistPluginOptions,
  PersistMetadata,
  PersistOptions,
} from "@legendapp/state/sync";

const MetadataSuffix = "__legend_metadata";

function requestToPromise(request: IDBRequest) {
  return new Promise<void>((resolve) => (request.onsuccess = () => resolve()));
}

export class ObservablePersistIndexedDB implements ObservablePersistPlugin {
  private tableData: Record<string, any> = {};
  private tableMetadata: Record<string, any> = {};
  private tablesAdjusted: Map<string, Observable<boolean>> = new Map();
  private db: IDBDatabase | undefined;
  private isSaveTaskQueued = false;
  private pendingSaves = new Map<
    PersistOptions,
    Record<string, { tableName: string; tablePrev?: any; items: Set<string> }>
  >();
  private promisesQueued: (() => void)[] = [];
  private configuration: ObservablePersistIndexedDBPluginOptions;

  constructor(configuration: ObservablePersistIndexedDBPluginOptions) {
    this.configuration = configuration;
    this.doSave = this.doSave.bind(this);
  }
  public async initialize(configOptions: ObservablePersistPluginOptions) {
    const config = this.configuration || configOptions.indexedDB;
    if (typeof indexedDB === "undefined") return;
    if (process.env.NODE_ENV === "development" && !config) {
      console.error("[legend-state] Must configure ObservablePersistIndexedDB");
    }

    const { databaseName, version, tableNames } = config;
    const openRequest = indexedDB.open(databaseName, version);

    openRequest.onerror = () => {
      console.error(
        "[legend-state] ObservablePersistIndexedDB load error",
        openRequest.error
      );
    };

    openRequest.onupgradeneeded = (event) => {
      const db = openRequest.result;
      const { tableNames, deleteTableNames, onUpgradeNeeded } = config!;
      // let the user take care of adding new, deleting old object stores or transforming data between versions if wanted
      if (onUpgradeNeeded) {
        onUpgradeNeeded(event);
      } else {
        // Delete all tables explicitly specified
        deleteTableNames?.forEach((table) => {
          if (db.objectStoreNames.contains(table)) {
            db.deleteObjectStore(table);
          }
        });

        // Create a table for each name with "id" as the key
        tableNames.forEach((table) => {
          if (!db.objectStoreNames.contains(table)) {
            db.createObjectStore(table);
          }
        });
      }
    };

    return new Promise<void>((resolve) => {
      openRequest.onsuccess = async () => {
        this.db = openRequest.result;

        // Load each table
        const objectStoreNames = this.db.objectStoreNames;
        const tables = tableNames.filter((table) =>
          objectStoreNames.contains(table)
        );
        try {
          const transaction = this.db.transaction(tables, "readonly");

          await Promise.all(
            tables.map((table) => this.initTable(table, transaction))
          );
        } catch (err) {
          console.error("[legend-state] Error loading IndexedDB", err);
        }

        resolve();
      };
    });
  }
  public loadTable(
    table: string,
    config: PersistOptions
  ): void | Promise<void> {
    if (!this.db) {
      throw new Error(
        "[legend-state] ObservablePersistIndexedDB loading without being initialized. This may happen when running outside of a browser."
      );
    }

    if (!this.tableData[table]) {
      const transaction = this.db!.transaction(table, "readonly");

      return this.initTable(table, transaction).then(() =>
        this.loadTable(table, config)
      );
    }

    const prefix = config.indexedDB?.prefixID;

    if (prefix) {
      const tableName = prefix ? table + "/" + prefix : table;
      if (this.tablesAdjusted.has(tableName)) {
        const promise = when(this.tablesAdjusted.get(tableName)!);
        if (isPromise(promise)) {
          return promise as unknown as Promise<void>;
        }
      } else {
        const obsLoaded = observable(false);
        this.tablesAdjusted.set(tableName, obsLoaded);
        const data = this.getTable(table, {}, config);
        let hasPromise = false;
        let promises: Promise<any>[];
        if (data) {
          const keys = Object.keys(data);
          promises = keys.map(async (key) => {
            const value = data[key];

            if (isPromise(value)) {
              hasPromise = true;
              return value.then(() => {
                data[key] = value;
              });
            } else {
              data[key] = value;
            }
          });
        }
        if (hasPromise) {
          return Promise.all(promises!).then(() => {
            obsLoaded.set(true);
          });
        } else {
          obsLoaded.set(true);
        }
      }
    }
  }
  public getTable(table: string, init: object, config: PersistOptions) {
    const configIDB = config.indexedDB;
    const prefix = configIDB?.prefixID;
    const data = this.tableData[prefix ? table + "/" + prefix : table];
    if (data && configIDB?.itemID) {
      return data[configIDB.itemID];
    } else {
      return data;
    }
  }
  public getMetadata(table: string, config: PersistOptions) {
    const { tableName } = this.getMetadataTableName(table, config);
    return this.tableMetadata[tableName];
  }
  public async setMetadata(
    table: string,
    metadata: PersistMetadata,
    config: PersistOptions
  ) {
    const { tableName, tableNameBase } = this.getMetadataTableName(
      table,
      config
    );
    // Assign new metadata into the table, and make sure it has the id
    this.tableMetadata[tableName] = Object.assign(metadata, {
      id: tableNameBase + MetadataSuffix,
    });
    this.tableMetadata[tableName] = metadata;
    const store = this.transactionStore(table);
    return store.put(metadata);
  }
  public async deleteMetadata(
    table: string,
    config: PersistOptions
  ): Promise<void> {
    const { tableName, tableNameBase } = this.getMetadataTableName(
      table,
      config
    );
    delete this.tableMetadata[tableName];
    const store = this.transactionStore(table);
    const key = tableNameBase + MetadataSuffix;
    store.delete(key);
  }
  public async set(table: string, changes: Change[], config: PersistOptions) {
    if (typeof indexedDB === "undefined") return;

    if (!this.pendingSaves.has(config)) {
      this.pendingSaves.set(config, {});
    }
    const pendingSaves = this.pendingSaves.get(config)!;

    const realTable = table;
    const prefixID = config.indexedDB?.prefixID;
    if (prefixID) {
      table += "/" + prefixID;
    }
    const prev = this.tableData[table];

    const itemID = config.indexedDB?.itemID;

    if (!pendingSaves[table]) {
      pendingSaves[table] = { tableName: realTable, items: new Set() };
    }

    const pendingTable = pendingSaves[table];

    // Combine changes into a minimal set of saves
    for (let i = 0; i < changes.length; i++) {
      let { path, valueAtPath, pathTypes } = changes[i];
      if (itemID) {
        path = [itemID].concat(path as string[]);
        pathTypes.splice(0, 0, "object");
      }
      if (path.length > 0) {
        // If change is deep in an object save it to IDB by the first key
        const key = path[0] as string;
        if (!this.tableData[table]) {
          this.tableData[table] = {};
        }
        this.tableData[table] = setAtPath(
          this.tableData[table],
          path as string[],
          pathTypes,
          valueAtPath
        );
        pendingTable.items.add(key);
      } else {
        // Set the whole table
        this.tableData[table] = valueAtPath;
        pendingTable.tablePrev = prev || {};
        break;
      }
    }

    return new Promise<void>((resolve) => {
      this.promisesQueued.push(resolve);

      if (!this.isSaveTaskQueued) {
        this.isSaveTaskQueued = true;
        queueMicrotask(this.doSave);
      }
    });
  }
  private async doSave() {
    this.isSaveTaskQueued = false;
    const promisesQueued = this.promisesQueued;
    this.promisesQueued = [];
    const promises: Promise<IDBRequest>[] = [];
    let lastPut: IDBRequest | undefined;
    this.pendingSaves.forEach((pendingSaves, config) => {
      Object.keys(pendingSaves).forEach((table) => {
        const pendingTable = pendingSaves[table];
        const { tablePrev, items, tableName } = pendingTable;
        const store = this.transactionStore(tableName);
        const tableValue = this.tableData[table];
        if (tablePrev) {
          promises.push(
            this._setTable(table, tablePrev, tableValue, store, config)
          );
        } else {
          items.forEach((key) => {
            lastPut = this._setItem(table, key, tableValue[key], store, config);
          });
        }

        // Clear pending saves
        items.clear();
        delete pendingTable.tablePrev;
      });
    });
    this.pendingSaves.clear();

    // setTable awaits multiple sets and deletes so we need to await that to get
    // the lastPut from it.
    if (promises.length) {
      const puts = await Promise.all(promises);
      lastPut = puts[puts.length - 1];
    }

    if (lastPut) {
      await requestToPromise(lastPut);
    }

    promisesQueued.forEach((resolve) => resolve());
  }
  public async deleteTable(
    table: string,
    config: PersistOptions
  ): Promise<void> {
    const configIDB = config.indexedDB;
    const prefixID = configIDB?.prefixID;
    const tableName = prefixID ? table + "/" + prefixID : table;
    let data = this.tableData[tableName];
    const itemID = configIDB?.itemID;
    if (data && configIDB?.itemID) {
      const dataTemp = data[itemID!];
      delete data[itemID!];
      data = dataTemp;
    } else {
      delete this.tableData[tableName];
      delete this.tableData[tableName + "_transformed"];
    }

    if (typeof indexedDB === "undefined") return;

    this.deleteMetadata(table, config);

    if (data) {
      const store = this.transactionStore(table);
      let result: Promise<any>;
      if (!prefixID && !itemID) {
        result = requestToPromise(store.clear());
      } else {
        const keys = Object.keys(data);
        result = Promise.all(
          keys.map((key) => {
            if (prefixID) {
              key = prefixID + "/" + key;
            }
            return requestToPromise(store.delete(key));
          })
        );
      }
      // Clear the table from IDB
      return result;
    }
  }
  // Private
  private getMetadataTableName(table: string, config: PersistOptions) {
    const configIDB = config.indexedDB;
    let name = "";
    if (configIDB) {
      const { prefixID, itemID } = configIDB;

      if (itemID) {
        name = itemID;
      }
      if (prefixID) {
        name = prefixID + (name ? "/" + name : "");
      }
    }

    return {
      tableNameBase: name,
      tableName: name ? table + "/" + name : table,
    };
  }
  private initTable(table: string, transaction: IDBTransaction): Promise<void> {
    const store = transaction.objectStore(table);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();

    return new Promise((resolve) => {
      keysRequest.onsuccess = () => {
        valuesRequest.onsuccess = () => {
          const keys = keysRequest.result;
          const values = valuesRequest.result;

          if (!this.tableData[table]) {
            this.tableData[table] = {};
          }

          for (let i = 0; i < keys.length; i++) {
            const key = keys[i] as string;
            const value = values[i];

            if (key.endsWith(MetadataSuffix)) {
              const id = key.replace(MetadataSuffix, "");
              this.tableMetadata[table + (id ? "/" + id : "")] = value;
            } else {
              this.tableData[table][key] = value;
            }
          }

          resolve();
        };
      };
    });
  }
  private transactionStore(table: string) {
    const transaction = this.db!.transaction(table, "readwrite");
    return transaction.objectStore(table);
  }
  private _setItem(
    table: string,
    key: string,
    value: any,
    store: IDBObjectStore,
    config: PersistOptions
  ) {
    if (!value) {
      if (this.tableData[table]) {
        delete this.tableData[table][key];
      }
      return store.delete(key);
    } else {
      if (config) {
        if (!this.tableData[table]) {
          this.tableData[table] = {};
        }
        this.tableData[table][key] = value;
      }

      return store.put(value, key);
    }
  }
  private async _setTable(
    table: string,
    prev: object,
    value: Record<string, any>,
    store: IDBObjectStore,
    config: PersistOptions
  ) {
    const keys = Object.keys(value);
    let lastSet: IDBRequest | undefined;
    // Do a set for each key in the object
    const sets = await Promise.all(
      keys.map((key) => {
        const val = value[key];
        return this._setItem(table, key, val, store, config);
      })
    );
    lastSet = sets[sets.length - 1];

    // Delete keys that are no longer in the object
    if (prev) {
      const keysOld = Object.keys(prev);
      const deletes = (
        await Promise.all(
          keysOld.map((key) => {
            if (value[key] === undefined) {
              return this._setItem(table, key, null, store, config);
            }
          })
        )
      ).filter((a) => !!a);
      if (deletes.length > 0) {
        lastSet = deletes[deletes.length - 1];
      }
    }
    return lastSet!;
  }
}

export function observablePersistIndexedDB(
  configuration: ObservablePersistIndexedDBPluginOptions
) {
  return new ObservablePersistIndexedDB(configuration);
}
