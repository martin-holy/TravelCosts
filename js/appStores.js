class AppStore {
  constructor(dbSchema) {
    this.dbSchema = dbSchema;
  }

  async data(args = {}) {
    // args: sorted(bool) => sort by default
    //       orderBy(string) => sort by column name
    //       orderAsc(bool) => true is default

    // Get Store Records
    if (!this.cache)
      await this.cacheData().catch(() => { return []; });

    // Link Stores and Get Linked Stores Records
    for (const prop of this.dbSchema.properties) {
      if (!prop.source) continue;
      prop.source.store = appStores[prop.source.name];
      await prop.source.store.data({ sorted: true });
    }

    // Sort data
    if (args.sorted) { // sort by default
      args.orderBy = this.dbSchema.orderBy;
      args.orderAsc = this.dbSchema.orderAsc;
    }

    if (args.sorted || args.orderBy)
      this.cache.orderBy(args.orderBy, args.orderAsc);

    return this.cache;
  }

  cacheData() {
    return new Promise((resolve, reject) => {
      const tx = app.DB.db.transaction([this.dbSchema.name], 'readonly'),
        request = tx.objectStore(this.dbSchema.name).getAll();

      request.onsuccess = (e) => {
        this.cache = e.target.result;
        resolve();
      };

      request.onerror = (e) => {
        app.log(`getStoreRecords: ${e.target.errorCode}`, true);
        reject();
      };
    });
  }

  // insert, update and delete data from store based on action
  iudStoreData(action, data) {
    return new Promise(async (resolve, reject) => {
      const tx = app.DB.db.transaction([this.dbSchema.name], 'readwrite'),
            store = tx.objectStore(this.dbSchema.name),
            inserts = [];

      tx.oncomplete = () => {
        // add new records to cache to avoid retrieving all data from DB again
        if (this.cache)
          for (const inst of inserts) {
            inst[0].id = inst[1].result;
            this.cache.push(inst[0]);
          }

        app.log('All data updated in database!');
        resolve();
      };
  
      tx.onerror = (e) => {
        app.log(`There was an error:${e.target.errorCode}`, true);
        reject();
      };

      switch (action) {
        case 'insert': for (const rec of data) inserts.push([rec, store.add(rec)]); break;
        case 'update': for (const rec of data) store.put(rec); break;
        case 'delete': for (const rec of data) store.delete(rec); break;
      }
    });
  }

  async insert(data) {
    await this.iudStoreData('insert', data);
  }

  async update(data) {
    await this.iudStoreData('update', data);
  }

  async delete(data) {
    await this.iudStoreData('delete', data);
  }

  async getRecordById(id) {
    return (await this.data()).find(rec => rec.id === id);
  }
};

const appStores = {
  ADM_AppStores: new AppStore({ name: 'ADM_AppStores', id: 1, title: 'Application Stores',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'name', title: 'Name', type: 'text', required: true },
      { name: 'title', title: 'Title', type: 'text', required: true },
      { name: 'orderBy', title: 'Order by', type: 'text' },
      { name: 'orderAsc', title: 'Order Asc', type: 'bool' },
      { name: 'properties', title: 'Properties', type: 'properties', properties: [
        { name: 'default', title: 'Default', type: 'variable' }
      ]}
      /*,
      { name: 'onSaveFunc', title: 'onSave Func', type: 'text' },
      { name: 'properties', title: 'Properties', type: 'array', required: true, data: [], properties: [
        { name: 'name', title: 'Name', type: 'text', required: true },
        { name: 'title', title: 'Title', type: 'text', required: true },
        { name: 'type', title: 'Type', type: 'select', required: true, source: { name: 'ADM_PropertyTypes', property: 'id' }},
        { name: 'required', title: 'Required', type: 'bool' },
        { name: 'hidden', title: 'Hidden', type: 'bool' },
        { name: 'source', title: 'Source', type: 'select', source: { name: 'ADM_AppStores', property: 'title' }},
        { name: 'align', title: 'Align', type: 'select', source: { name: 'ADM_Alignments', property: 'id' }},
        { name: 'funcName', title: 'Function', type: 'select', source: { name: 'ADM_PropertyFunctions', property: 'id' }}
      ]},
      { name: 'functions', title: 'Functions', type: 'array', data: [], properties: [
        { name: 'name', title: 'Name', type: 'text', required: true },
        { name: 'title', title: 'Title', type: 'text', required: true }
      ]}*/
    ],
    functions: [
      { name: 'app.DB.import', title: 'Import data' },
      { name: 'app.DB.export', title: 'Export data' }
    ]
  }),

  ADM_AppStoreGroups: new AppStore({ name: 'ADM_AppStoreGroups', id: 2, title: 'Application Store Groups', orderBy: 'index',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'name', title: 'Name', type: 'text', required: true },
      { name: 'icon', title: 'Icon', type: 'text', required: true },
      { name: 'index', title: 'Index', type: 'int', required: true },
      { name: 'stores', title: 'Stores', type: 'multiSelect', required: true, source: { name: 'ADM_AppStores', property: 'name' }}
    ]
  }),

  ADM_AppSettings: new AppStore({ name: 'ADM_AppSettings', id: 3, title: 'Application Settings',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'dbVersion', title: 'DB Version', type: 'int', required: true }
    ]
  }),

  GLO_Countries: new AppStore({ name: 'GLO_Countries', id: 10, title: 'Countries', orderBy: 'name',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'name', title: 'Name', type: 'text', required: true },
      { name: 'code', title: 'Code', type: 'text', required: true }
    ]
  }),

  GLO_CountriesStay: new AppStore({ name: 'GLO_CountriesStay', id: 11, title: 'Countries Stay', orderBy: 'dateFrom', orderAsc: false,
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'dateFrom', title: 'From', type: 'date', required: true, align: 'center' },
      { name: 'dateTo', title: 'To', type: 'date', align: 'center' },
      { name: 'countryId', title: 'Country', type: 'select', required: true, source: { name: 'GLO_Countries', property: 'name' }},
      { name: 'days', title: 'Days', type: 'calc', align: 'right', funcName: 'numberOfDaysBetween' }
    ],
    functions: [
      { name: 'reports.gloCountriesStay.run', title: 'Report' },
      { name: 'reports.gloCountriesStaySum.run', title: 'Report Sum' }
    ]
  }),

  GLO_HelpPlaces: new AppStore({ name: 'GLO_HelpPlaces', id: 12, title: 'Help Places', orderBy: 'date', orderAsc: false,
    properties: [
      { name: 'id', title: 'id', type: 'int', required: true, hidden: true },
      { name: 'dateFrom', title: 'From', type: 'date', required: true, align: 'center' },
      { name: 'dateTo', title: 'To', type: 'date', align: 'center' },
      { name: 'name', title: 'Name', type: 'text', required: true },
      { name: 'days', title: 'Days', type: 'calc', align: 'right', funcName: 'numberOfDaysBetween' }
    ]
  }),

  GLO_People: new AppStore({ name: 'GLO_People', id: 13, title: 'People',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'name', title: 'Name', type: 'text', required: true },
      { name: 'active', title: 'Active', type: 'bool' },
      { name: 'bgColor', title: 'Color', type: 'text' }
    ]
  }),

  MON_Costs: new AppStore({ name: 'MON_Costs', id: 20, title: 'Costs', orderBy: 'date', orderAsc: false,
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'date', title: 'Date', type: 'date', required: true, align: 'center' },
      { name: 'amount', title: 'Amount', type: 'num', required: true, align: 'right' },
      { name: 'currencyId', title: 'Code', type: 'select', required: true, align: 'center', default: [8], source: { name: 'MON_Currencies', property: 'code' }},
      { name: 'eur', title: 'EUR', type: 'calc', align: 'right', funcName: 'amountInEUR' },
      { name: 'costTypeId', title: 'Type', type: 'select', required: true, default: [1], source: { name: 'MON_CostsTypes', property: 'name' }},
      { name: 'desc', title: 'Description', type: 'text' },
      { name: 'countryId', title: 'Country', type: 'select', required: true, default: [16], source: { name: 'GLO_Countries', property: 'name' }}
    ],
    functions: [
      { name: 'reports.monCosts.run', title: 'Report' }
    ]
  }),

  MON_Incomes: new AppStore({ name: 'MON_Incomes', id: 21, title: 'Incomes', orderBy: 'date', orderAsc: false,
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'date', title: 'Date', type: 'date', required: true, align: 'center' },
      { name: 'amount', title: 'Amount', type: 'num', required: true, align: 'right' },
      { name: 'currencyId', title: 'Code', type: 'select', required: true, align: 'center', default: [9], source: { name: 'MON_Currencies', property: 'code' }},
      { name: 'eur', title: 'EUR', type: 'calc', align: 'right', funcName: 'amountInEUR' },
      { name: 'desc', title: 'Description', type: 'text' }
    ]
  }),

  MON_Debts: new AppStore({ name: 'MON_Debts', id: 22, title: 'Debts', orderBy: 'date', orderAsc: false,
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'date', title: 'Date', type: 'date', required: true, align: 'center' },
      { name: 'payerId', title: 'Payer', type: 'select', required: true, source: { name: 'GLO_People', property: 'name' }},
      { name: 'debtorId', title: 'Debtor', type: 'select', required: true, source: { name: 'GLO_People', property: 'name' }},
      { name: 'amount', title: 'Amount', type: 'num', required: true, align: 'right' },
      { name: 'currencyId', title: 'Code', type: 'select', required: true, align: 'center', default: [8], source: { name: 'MON_Currencies', property: 'code' }},
      { name: 'desc', title: 'Description', type: 'text' }
    ],
    functions: [
      { name: 'monDebtsCalc', title: 'Debts calc' }
    ]
  }),

  MON_CostsTypes: new AppStore({ name: 'MON_CostsTypes', id: 23, title: 'Costs Types', orderBy: 'name',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'name', title: 'Name', type: 'text', required: true },
      { name: 'bgColor', title: 'Color', type: 'text' }
    ]
  }),

  MON_Currencies: new AppStore({ name: 'MON_Currencies', id: 24, title: 'Currencies', orderBy: 'code',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'code', title: 'Code', type: 'text', required: true },
      { name: 'name', title: 'Name', type: 'text', required: true },
      { name: 'date', title: 'Date', type: 'date', required: true, align: 'center' },
      { name: 'amount', title: 'Amount', type: 'num', required: true, align: 'right' }
    ],
    functions: [
      { name: 'monUpdateRates', title: 'Update Rates' }
    ]
  }),

  MON_Rates: new AppStore({ name: 'MON_Rates', id: 26, title: 'Rates', orderBy: 'date', orderAsc: false,
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'date', title: 'Date', type: 'date', required: true, align: 'center' },
      { name: 'amount', title: 'Amount', type: 'num', required: true, align: 'right' },
      { name: 'currencyId', title: 'Code', type: 'select', required: true, align: 'center', source: { name: 'MON_Currencies', property: 'code' }}
    ],
    functions: [
      { name: 'monUpdateMissingRates', title: 'Update Rates' }
    ]
  }),

  CAR_Drives: new AppStore({ name: 'CAR_Drives', id: 30, title: 'Drives', orderBy: 'kmTotal', orderAsc: false, onSaveFunc: 'carUpdatePricePerDrives',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'date', title: 'Date', type: 'date', required: true, align: 'center' },
      { name: 'kmTotal', title: 'Total', type: 'int', required: true, align: 'right' },
      { name: 'km', title: 'Km', type: 'readOnly', align: 'right' },
      { name: 'eur', title: 'EUR', type: 'readOnly', align: 'right' },
      { name: 'desc', title: 'Description', type: 'text' },
      { name: 'people', title: 'People', type: 'multiSelect', required: true, default: [1,2], source: { name: 'GLO_People', property: 'name' }}
    ],
    functions: [
      { name: 'reports.carDrives.run', title: 'Report Km/Days/Places' },
      { name: 'reports.carDrives2.run', title: 'Report Km/EUR' }
    ]
  }),

  CAR_Refueling: new AppStore({ name: 'CAR_Refueling', id: 31, title: 'Refueling', orderBy: 'date', orderAsc: false, onSaveFunc: 'carCalcConsumptions',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'date', title: 'Date', type: 'date', required: true, align: 'center' },
      { name: 'kmTotal', title: 'Total', type: 'int', required: true, align: 'right' },
      { name: 'liters', title: 'Liters', type: 'num', required: true, align: 'right' },
      { name: 'pricePerLiter', title: 'Price', type: 'num', required: true, align: 'right' },
      { name: 'currencyId', title: 'Code', type: 'select', required: true, align: 'center', source: { name: 'MON_Currencies', property: 'code' }},
      { name: 'fullTank', title: 'Full', type: 'bool' },
      { name: 'consumption', title: 'l/100km', type: 'readOnly', align: 'right' }
    ],
    functions: [
      { name: 'reports.carRefueling.run', title: 'Report' }
    ]
  }),

  CAR_PricePerKm: new AppStore({ name: 'CAR_PricePerKm', id: 32, title: 'Price per Km', orderBy: 'kmFrom', orderAsc: false,
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'kmFrom', title: 'Km from', type: 'int', required: true, align: 'right' },
      { name: 'kmTo', title: 'Km to', type: 'int', required: true, align: 'right' },
      { name: 'eur', title: 'EUR', type: 'calc', align: 'right', funcName: 'carGetEurPerKm' },
      { name: 'eurTotal', title: 'EUR total', type: 'num', required: true, align: 'right' },
      { name: 'costTypeId', title: 'Type', type: 'select', required: true, align: 'center', source: { name: 'CAR_CostsTypes', property: 'name' }},
      { name: 'desc', title: 'Description', type: 'text' }
    ],
    functions: [
      {name: 'carUpdateDieselPricePerKm', title: 'Update price/Km'}
    ]
  }),

  CAR_PricePerDay: new AppStore({ name: 'CAR_PricePerDay', id: 33, title: 'Price per day', orderBy: 'dateFrom', 
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'dateFrom', title: 'From', type: 'date', required: true, align: 'center' },
      { name: 'dateTo', title: 'To', type: 'date', required: true, align: 'center' },
      { name: 'eur', title: 'EUR', type: 'calc', align: 'right', funcName: 'carGetEurPerDay' },
      { name: 'eurTotal', title: 'EUR total', type: 'num', required: true, align: 'right' },
      { name: 'costTypeId', title: 'Type', type: 'select', required: true, align: 'center', source: { name: 'CAR_CostsTypes', property: 'name' }}
    ]
  }),

  CAR_PresencePerDay: new AppStore({ name: 'CAR_PresencePerDay', id: 34, title: 'Presence per day', orderBy: 'dateFrom', 
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'dateFrom', title: 'From', type: 'date', required: true, align: 'center' },
      { name: 'dateTo', title: 'To', type: 'date', align: 'center' },
      { name: 'personId', title: 'Person', type: 'select', required: true, source: { name: 'GLO_People', property: 'name' }}
    ]
  }),

  CAR_CostsTypes: new AppStore({ name: 'CAR_CostsTypes', id: 35, title: 'Costs Types', orderBy: 'name',
    properties: [
      { name: 'id', title: 'Id', type: 'int', required: true, hidden: true },
      { name: 'name', title: 'Name', type: 'text', required: true },
      { name: 'bgColor', title: 'Color', type: 'text' }
    ]
  })
};
