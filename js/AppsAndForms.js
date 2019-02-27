var aaf = aaf || {
  currentForm: {},
  db: null,
  dbName: "TravelCosts",
  dbVersion: 2,
  dbSchema: [],

  // log
  log: function(msg, withAlert = false) {
    console.log(msg);
    if (withAlert) alert(msg);
  },

  // openDb
  openDb: function() {
    this.log("openDb ...");
    let isUpdgradeNeeded = false,
        req = window.indexedDB.open(this.dbName, 1); // version always 1
  
    req.onsuccess = (e) => {
      this.db = e.target.result;
      this.db.onerror = (e) => {
        this.log("Database error: " + e.target.errorCode, true);
      }
      this.log("openDb: done");
      if (isUpdgradeNeeded) {
        this.insertUpdateInitDBData();
      } else {
        this.dbLoadFinished();
      }
    };
  
    req.onerror = (e) => {
      this.log("openDb:" + e.target.errorCode, true);
    };
  
    req.onupgradeneeded = (e) => {
      this.log("openDb.onupgradeneeded");
      isUpdgradeNeeded = true;
      this.db = e.target.result;
      this.db.onerror = (e) => {
        this.log("openDb.onupgradeneeded: " + e.target.errorCode, true);
      };
  
      for (let store of appStores)
        this.db.createObjectStore(store.name, { keyPath: "id", autoIncrement: true });
    };
  },

  // insertUpdateInitDBData
  insertUpdateInitDBData: async function() {
    await this.insertStoreData('ADM_AppStores', appStores);
    await this.insertStoreData('ADM_AppStoreGroups', [
      { name: 'Administration', icon: '0x1F60E', index: 4, stores: [1,2] },
      { name: 'Travel Costs & Incomes', icon: '0x1F92A', index: 1, stores: [20,21,22,23,24,25,26]},
      { name: 'Car', icon: '0x1F3DE', index: 2, stores: [30,31,32,33,34,35]},
      { name: 'Global', icon: '0x1F30D', index: 3, stores: [10,11,12,13]}
    ]);
    await this.insertStoreData('ADM_AppSettings', [{ id: 1, dbVersion: this.dbVersion }]);
    this.dbLoadFinished();
  },
  
  insertStoreData: function(storeName, data) {
    return new Promise(async (resolve, reject) => {
      let tx = this.db.transaction([storeName], "readwrite"),
          store = tx.objectStore(storeName);
  
      tx.oncomplete = () => {
        this.log("All data inserted/updated in database!");
        resolve();
      };
  
      tx.onerror = (e) => {
        this.log("There was an error:" + e.target.errorCode, true);
        reject();
      };

      for (let d of data)
        store.add(d);
    });
  },
  
  dbLoadFinished: async function() {
    this.log("openDb: Load Finished");
    this.dbSchema = await this.getStoreRecords('ADM_AppStores');
    for (let s of this.dbSchema) await this.linkStores(s);
    await this.updateDbSchema();
    this.createAppMap();
  },

  linkStores: function(store) {
    return new Promise(async (resolve) => {
      for (let p of store.properties) {
        if (!p.source) continue;
        p.source.store = this.dbSchema.find(s => s.name == p.source.name);
        await this.getStoreRecords(p.source.name, true); 
      }
      resolve();
    });
  },

  updateDbSchema: function() {
    return new Promise(async (resolve, reject) => {
      let settings = await this.getStoreRecordById('ADM_AppSettings', 1);

      if (settings.dbVersion == this.dbVersion) {
        resolve();
        return;
      }

      if (settings.dbVersion < 2) {
        let fn = function (core) {
          return new Promise(async (resolve, reject) => {
            let tx = core.db.transaction(['ADM_AppStores'], 'readwrite'),
            store = tx.objectStore('ADM_AppStores'),
            storeSchema = await core.getStoreRecordById('ADM_AppStores', 30); // CAR_Drives

            tx.oncomplete = resolve();
            storeSchema.functions = [{ name: 'carDrivesReport', title: 'Report' }];
            store.put(storeSchema);
          }
        )};
        await fn(this);
      }

      if (settings.dbVersion < 3) {
        //...
      }

      let tx = this.db.transaction(['ADM_AppSettings'], 'readwrite'),
          store = tx.objectStore('ADM_AppSettings');
        
      tx.oncomplete = resolve();
      settings.dbVersion = this.dbVersion;
      store.put(settings);
    });
  },
  
  createAppMap: async function() {
    let stores = await this.getStoreRecords("ADM_AppStores"),
        storeGroups = await this.getStoreRecords("ADM_AppStoreGroups", true),
        groups = [];
  
    for (let group of storeGroups) {
      let ul = [];
  
      for (let storeId of group.stores) {
        let store = stores.find(s => s.id == storeId);
        ul.push(`<li><a href="#" onclick="aaf.loadForm(\'${store.name}\');">${store.title}</a></li>`);
      }
  
      groups.push(`
        <table>
          <tr><td colspan="2"><h2>${group.name}</h2></td></tr>
          <tr><td class="emojiIcon">${String.fromCodePoint(group.icon)}</td><td><ul>${ul.join('')}</ul></td></tr>
        </table>`);
    }
  
    document.getElementById('mainContent').innerHTML = `<div id="appMap">${groups.join('')}</div>`;
    document.getElementById('title').innerHTML = 'Travel Costs';
    document.getElementById('menu').innerHTML = '<li onclick="aaf.testFunc();aaf.menuButtonClick();">Test Func</li>';
  },
  
  exportData: async function() {
    let data = {stores: []},
        stores = await this.getStoreRecords("ADM_AppStores");
    
    for (let store of stores) {
      if (store.name.startsWith('ADM_')) continue;
      data.stores.push({ name: store.name, values: await this.getStoreRecords(store.name) });
    }
  
    let file = new Blob([JSON.stringify(data)], {type: "text/plain"}),
        a = document.createElement("a"),
        url = URL.createObjectURL(file);
  
    a.href = url;
    a.download = `travelCostsExport_${new Date().toYMD()}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 0);
  },
  
  importData: function() {
    return new Promise((resolve, reject) => {
      let input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
  
      input.addEventListener("change", (e) => {
        let reader = new FileReader();
        reader.onload = (e) => {
          let dbSource = JSON.parse(e.target.result),
              storeNames = [];
  
          for (let store of dbSource.stores) storeNames.push(store.name);
  
          let tx = this.db.transaction(storeNames, "readwrite");
      
          tx.oncomplete = () => {
            this.log("Database import done!");
            alert("Done");
            resolve();
          };
      
          tx.onerror = (e) => {
            this.log("There was an error:" + e.target.errorCode, true);
            reject();
          };

          for (let store of dbSource.stores) {
            let dbstore = tx.objectStore(store.name),
                delRequest = dbstore.clear();
  
            delRequest.onsuccess = () => {
              for (let item of store.values) 
                dbstore.add(item);
            } 
          }
        };
        reader.readAsText(e.srcElement.files[0]);
      });
      input.dispatchEvent(new MouseEvent("click"));
    });
  },
  
  getStoreRecords: function(name, sorted = false) {
    return new Promise((resolve, reject) => {
      let store = this.dbSchema.find(store => store.name == name);
      if (store && store.data) {
        resolve(sorted && store.orderBy ? store.data.orderBy(store.orderBy, store.orderAsc) : store.data);
        return;
      } 
  
      let tx = this.db.transaction([name], "readonly"),
          request = tx.objectStore(name).openCursor(),
          data = [];
  
      request.onsuccess = (e) => {
        let cursor = e.target.result;
  
        if (cursor) {
          data.push(cursor.value);
          cursor.continue();
        } else {
          if (store) {
            store.data = sorted && store.orderBy ? data.orderBy(store.orderBy, store.orderAsc) : data;
            resolve(store.data); 
          }
          else //app load, this.dbSchema is empty now, this is data for this.dbSchema
            resolve(data);
        }
      };
  
      request.onerror = (e) => {
        reject(e.target.errorCode);
        this.log(`getStoreRecords: ${e.target.errorCode}`, true);
      };
    });
  },
  
  getStoreRecordById: async function(name, id) {
    return (await this.getStoreRecords(name)).find(rec => rec.id == id);
  },

  loadForm: async function(frm) {
    document.getElementById('menu').style.visibility = 'hidden';
    this.contentTabs.clear();
    this.contentTabs.add('grid');
    this.contentTabs.add('edit');
    this.contentTabs.add('chartView');
    this.contentTabs.add('treeView');
    this.contentTabs.active('grid');
  
    this.currentForm = this.dbSchema.find(store => store.name == frm);
    this.createMenu();
    document.getElementById('grid').innerHTML = await this.getGrid();
    this.createEdit();
    document.getElementById('title').innerHTML = this.currentForm.title;
  },

  contentTabs: {
    id: 'mainContent',

    add: function(name) {
      document.getElementById(this.id).innerHTML += `<div id="${name}" style="display: none;"></div>`;
    },
    
    clear: function() {
      document.getElementById(this.id).innerHTML = '';
    },
    
    active: function(name) {
      document.getElementById(this.id).childNodes.forEach(x => x.style.display = 'none');
      document.getElementById(name).style.display = 'block';
    }
  },

  menuButtonClick: function() {
    let menu = document.getElementById('menu');
    menu.style.visibility = menu.style.visibility == 'visible' ? 'hidden' : 'visible';
  },
  
  createMenu: async function() {
    let stores = await this.getStoreRecords("ADM_AppStores"),
        groups = await this.getStoreRecords("ADM_AppStoreGroups"),
        siblings = groups.find(g => g.stores.includes(this.currentForm.id)).stores,
        items = [];
      
    //link to site map
    items.push('<li onclick="aaf.createAppMap();aaf.menuButtonClick();">Home</li>');
    //header Forms
    items.push('<li class="liDivider">Forms</li>');
    for (let storeId of siblings) {
      let s = stores.find(store => store.id == storeId);
      items.push(`<li onclick="aaf.loadForm(\'${s.name}\');">${s.title}</li>`);
    }
    items.push('<li class="liDivider">---</li>');
    items.push('<li onclick="aaf.editRecord(-1);aaf.menuButtonClick();">New Record</li>');
    //forms functions
    if (this.currentForm.functions)
      for (let func of this.currentForm.functions) {
        items.push(`<li onclick="${func.name}();aaf.menuButtonClick();">${func.title}</li>`);
      }
  
    document.getElementById("menu").innerHTML = items.join('');
  },
  
  // Generate Grid view
  getGrid: async function(form = this.currentForm, gridItems = null, editable = true) {
    let thead = [];
    for (let prop of form.properties) {
      if (prop.hidden || prop.type == 'array') continue;
      thead.push(`<th>${prop.title}</th>`);
    }
  
    let tbody = [];
    if (gridItems == null) gridItems = await this.getStoreRecords(form.name, true);
  
    for (let item of gridItems) {
      let tds = [];
      
      for (let prop of form.properties) {
        if (prop.hidden || prop.type == 'array') continue;
        
        let style = prop.align ? `text-align:${prop.align};` : '',
            val;
  
        if (prop.source) {
          if (prop.type == 'multiSelect') {
            let tmp = [];
            for (v of item[prop.name]) 
              tmp.push(prop.source.store.data.find(d => d.id == v)[prop.source.property]);
            val = tmp.join(', ');
          }
          else {
            let srcItem = prop.source.store.data.find(d => d.id == item[prop.name]);
            if (srcItem !== undefined) {
              style += srcItem.bgColor ? `background-color:${srcItem.bgColor};` : '';
              val = srcItem[prop.source.property];
            } else val = '';          
          }
        } else 
          val = item[prop.name];
  
        if (val === undefined || val === null) val = '';
  
        if (prop.name == 'bgColor')
          style += val == '' ? '' : `background-color:${val};`;
  
        if (prop.type == 'button')
          val = `<button onclick='${prop.funcName}();'></button>`;
        
        tds.push(`<td${style != '' ? ` style="${style}"` : ''}>${val}</td>`);
      }
      tbody.push(`<tr${editable ? ` onclick="aaf.editRecord(${item.id});"` : ''}>${tds.join('')}</tr>`);
    }
  
    return `<table class="grid"><thead><tr>${thead.join('')}</tr></thead><tbody>${tbody.join('')}</tbody></table>`;
  },
  
  //Generate Edit form
  createEdit: async function() {
    let tbody = [];
  
    for (prop of this.currentForm.properties) {
      if (prop.hidden) continue;
      switch (prop.type) {
        case 'calc':
        case 'readOnly':
        case 'button': continue;
        case 'properties':
          tbody.push(`<tr><td colspan="2">${prop.title} Defaults:</td></tr>`);
          tbody.push(`<tr><td colspan="2"><table id="__table_${prop.name}"></table></td></tr>`);
          break;
        default:
          tbody.push(`<tr><td>${prop.title}:</td><td>${this.getInput(prop)}</td></tr>`);
          break;
      }
    }
  
    document.getElementById('edit').innerHTML = `
      <table>${tbody.join('')}</table>
      <div>
        <button onclick="aaf.saveRecord(); return false;">Save</button>
        <button onclick="aaf.cancelEdit(); return false;">Cancel</button>
        <button onclick="aaf.deleteRecord(); return false;" id="btnDelete">Delete</button>
      </div>`;
  },
  
  //Generate input for editing
  getInput: function(prop) {
    let required = prop.required ? 'required' : '',
        readonly = prop.readonly ? 'readonly' : '';
  
    switch (prop.type) {
      case 'int': return `<input type="number" id="__${prop.name}" ${readonly} ${required}>`;
      case 'num': return `<input type="text" id="__${prop.name}" ${readonly} ${required} pattern="^[0-9]+(\.[0-9]+)?$">`;
      case 'date': return `<input type="date" id="__${prop.name}" ${readonly} ${required}>`;
      case 'text': return `<input type="text" id="__${prop.name}" ${readonly} ${required}>`;
      case 'textarea': return `<textarea id="__${prop.name}" ${readonly} ${required}></textarea>`;
      case 'bool': return `<input type="checkbox" id="__${prop.name}" ${readonly}>`;
      case 'select':
      case 'multiSelect':  {
        let select = xSelect(`__${prop.name}`),
            data = [];

        for (let x of prop.source.store.data) 
          data.push({ value: x.id, name: x[prop.source.property] });

        select.create(data, prop.type == 'multiSelect');

        if (prop.source.onchangeFunc === undefined)
          delete select.element.dataset.onchange;
        else 
          select.element.dataset.onchange = prop.source.onchangeFunc;

        return select.element.outerHTML;
      }
      default: return '';
    }
  },
  
  editRecord: async function(id) {
    let isNew = id == -1;
    document.getElementById('btnDelete').disabled = isNew;
    this.currentForm.currentRecord = isNew ? {} : await this.getStoreRecordById(this.currentForm.name, id);
    
    if (isNew) { // preset default
      for (prop of this.currentForm.properties) {
        if (prop.hidden) continue;
        switch(prop.type) {
          case 'calc':
          case 'readOnly':
          case 'button':
          case 'properties':
          case 'variable': continue;
          case 'date': document.getElementById(`__${prop.name}`).value = new Date().toYMD(); break;
          case 'select': if (prop.default) xSelect(`__${prop.name}`).set(prop.default); break;
          case 'multiSelect': if(prop.default) xSelect(`__${prop.name}`).set(prop.default); break;
          default : document.getElementById(`__${prop.name}`).value = '';
        }
      }
    } else {
      for (prop of this.currentForm.properties) {
        if (prop.hidden) continue;
        let rec = this.currentForm.currentRecord;
        switch (prop.type) {
          case 'calc':
          case 'readOnly':
          case 'button': continue;
          case 'bool': document.getElementById(`__${prop.name}`).toggleAttribute('checked', rec[prop.name]); break;
          case 'select': xSelect(`__${prop.name}`).set([rec[prop.name]]); break;
          case 'multiSelect': xSelect(`__${prop.name}`).set(rec[prop.name]); break;
          case 'properties':
            await this.linkStores(rec);
            let table = document.getElementById(`__table_${prop.name}`),
                props = rec[prop.name].filter(x => x.source),
                trs = [];
            
            for (let x of props) trs.push(`<tr><td>${x.title}:</td><td>${this.getInput(x)}</td></tr>`);
            table.innerHTML = trs.join('');
            for (let x of props) {
              if (!x.default) continue;
              xSelect(`__${x.name}`).set(x.default)
            }
            break;
          default: document.getElementById(`__${prop.name}`).value = rec[prop.name] || ''; break;
        }       
      }
    }
  
    document.getElementById('edit').style.display = 'block';
  },
  
  saveRecord: async function() {
    if (document.querySelector('#edit').querySelectorAll(':invalid').length > 0) return;
    //TODO check for required multiselect
    let rec = this.currentForm.currentRecord;
  
    for (prop of this.currentForm.properties) {
      if (prop.hidden) continue;
      let elm = document.getElementById(`__${prop.name}`);
      switch (prop.type) {
        case 'calc':
        case 'readOnly':
        case 'button': continue;
        case 'bool': rec[prop.name] = elm.checked; break;
        case 'int':
        case 'num': rec[prop.name] = elm.value == '' ? null : Number(elm.value); break;
        case 'select': rec[prop.name] = xSelect(`__${prop.name}`).get()[0]; break;
        case 'multiSelect': rec[prop.name] = xSelect(`__${prop.name}`).get(); break;
        case 'properties': 
          for (let x of rec[prop.name]) {
            if (!x.source) continue;
            x.default = xSelect(`__${x.name}`).get();
          }
          break;
        default: rec[prop.name] = elm.value == '' ? null : elm.value;
      }
    }
  
    for (prop of this.currentForm.properties) {
      if (prop.type != 'calc') continue;
      rec[prop.name] = await window[prop.funcName](rec);
    }
  
    let tx = this.db.transaction([this.currentForm.name], 'readwrite'),
        store = tx.objectStore(this.currentForm.name);
        
    tx.oncomplete = async () => {
      this.hideEdit();
      delete this.currentForm.data;
      if (this.currentForm.onSaveFunc)
        await window[this.currentForm.onSaveFunc]();
      document.getElementById('grid').innerHTML = await this.getGrid();
    };
  
    if (rec.id) store.put(rec); else store.add(rec);
  },
  
  //Cancel Edit
  cancelEdit: function() {
    this.hideEdit();
  },
  
  //Hide Edit form
  hideEdit: function() {
    document.getElementById('edit').style.display = 'none';
  },
  
  //Delete Record
  deleteRecord: async function() {
    if (confirm('Do you want to delete this record?')) {
      //check if can be deleted
      for (let store of this.dbSchema) {
        for (let prop of store.properties) {
          if (prop.source && prop.source.name == this.currentForm.name) {
            let storeItems = await this.getStoreRecords(store.name);
            if (storeItems.filter(item => item[prop.name] == this.currentForm.currentRecord.id).length > 0) {
              alert(`This record can't be deleted because is used in ${store.title} store!`);
              return;
            }
          }
        }
      }
  
      var request = this.db.transaction([this.currentForm.name], "readwrite")
                          .objectStore(this.currentForm.name)
                          .delete(this.currentForm.currentRecord.id);
      request.onsuccess = async () => {
        this.hideEdit();
        delete this.currentForm.data;
        document.getElementById('grid').innerHTML = await this.getGrid();
      };
    }
  },

  canvas: {
    drawRect: function drawRect(ctx, X, Y, width, height, fillStyle, strokeStyle, angle) {
      let tX = X, tY = Y;
      if (angle != 0 || angle !== undefined) {
        ctx.save();
        ctx.translate(tX, tY);
        ctx.rotate(angle * Math.PI / 180);
        X = 0;
        Y = 0;
      }
      if (fillStyle !== undefined) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(X, Y, width, height);
      }
      if (strokeStyle !== undefined) {
        ctx.strokeStyle = strokeStyle;
        ctx.strokeRect(X, Y, width, height);
      }
      if (angle != 0 || angle !== undefined) {
        ctx.translate(-tX, -tY);
        ctx.restore();
      }
    },
    
    drawText: function drawText(ctx, text, X, Y, fillStyle, strokeStyle, font, angle) {
      let tX = X, tY = Y;
      if (angle != 0 || angle !== undefined) {
        ctx.save();
        ctx.translate(tX, tY);
        ctx.rotate(angle * Math.PI / 180);
        X = 0;
        Y = 0;
      }
      if (font !== undefined) ctx.font = font;
      if (fillStyle !== undefined) {
        ctx.fillStyle = fillStyle;
        ctx.fillText(text, X, Y);
      }
      if (strokeStyle !== undefined) {
        ctx.strokeStyle = strokeStyle;
        ctx.strokeText(text, X, Y);
      }
      if (angle != 0 || angle !== undefined) {
        ctx.translate(-tX, -tY);
        ctx.restore();
      }
    }
  },

  testFunc: async function() {
    /*let drives = await this.getStoreRecords('CAR_Drives'),
        data = [];
    for (let d of drives) {
      let month = d.date.substring(0, 7),
          item = data.find(x => x.date == month);
      if (item == null) {
        item = { date: month, count: 0 };
        data.push(item);
      }
      item.count++;
    }*/
    this.contentTabs.clear();
    this.contentTabs.add('treeView');
    this.contentTabs.active('treeView');
    carDrivesReport();
  }
};

window.addEventListener('load', async () => {
  navigator.serviceWorker
    .register('/TravelCosts/sw_cached_files.js')
    .then(reg => aaf.log('Service Worker: Registered'))
    .catch(err => aaf.log(`Service Worker: Error: ${err}`, true));

  aaf.openDb();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}