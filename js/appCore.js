const appCore = {
  appVersion: 'v2019.03.29',
  currentForm: {},

  // DB
  db: {
    db: null,
    dbName: 'TravelCosts',
    dbVersion: 7,
    dbSchema: [],

    open: function() {
      return new Promise((resolve, reject) => {
        let isUpdgradeNeeded = false,
            req = window.indexedDB.open(this.dbName, 1); // version always 1
  
        req.onsuccess = (e) => {
          this.db = e.target.result;
          this.db.onerror = (e) => {
            appCore.log(`Database Error: ${e.target.errorCode}`, true);
          }

          resolve(isUpdgradeNeeded);
        };
      
        req.onerror = (e) => {
          throw new Error(`Open Database Error: ${e.target.errorCode}`);
        };
      
        req.onupgradeneeded = (e) => {
          isUpdgradeNeeded = true;
          this.db = e.target.result;
          this.db.onerror = (e) => {
            appCore.log(`Database OnUpgradeNeeded Error: ${e.target.errorCode}`, true);
          };
      
          for (let store of Object.keys(appStores))
            this.db.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
        };
      });
    },

    init: function() {
      let stores = [];
      for (let s of Object.values(appStores))
        stores.push(s.dbSchema);
  
      return Promise.all([
        appStores.ADM_AppStores.insert(stores),
        appStores.ADM_AppStoreGroups.insert([
          { id: 1, name: 'Administration', icon: 'adm', index: 4, stores: [1,2] },
          { id: 2, name: 'Travel Costs & Incomes', icon: 'money', index: 1, stores: [20,21,22,23,24,26]},
          { id: 3, name: 'Car', icon: 'car', index: 2, stores: [30,31,32,33,34,35]},
          { id: 4, name: 'Global', icon: 'global', index: 3, stores: [10,11,12,13]}
        ]),
        appStores.ADM_AppSettings.insert([{ id: 1, dbVersion: this.dbVersion }])
      ]);
    },

    updateSchema: function() {
      return new Promise(async (resolve) => {
        const settings = await appStores.ADM_AppSettings.getRecordById(1);
  
        if (settings.dbVersion == this.dbVersion) {
          resolve();
          return;
        }
  
        if (settings.dbVersion < 5) {
          const g = await appStores.ADM_AppStoreGroups.getRecordById(2);
          g.stores = [20,21,22,23,24,26];
          await appStores.ADM_AppStoreGroups.update([g]);
        }
  
        settings.dbVersion = this.dbVersion;
        await appStores.ADM_AppSettings.update([settings]);

        resolve();
      });
    },

    export: async function() {
      const data = {stores: []};
  
      for (const store of Object.values(appStores)) {
        if (store.dbSchema.name.startsWith('ADM_')) continue;
  
        data.stores.push({
          name: store.dbSchema.name, 
          values: await store.data()
        });
      }
  
      let file = new Blob([JSON.stringify(data)], {type: 'text/plain'}),
          url = URL.createObjectURL(file),
          a = document.createElement('a');
  
      a.href = url;
      a.download = `travelCostsExport_${new Date().toYMD()}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 0);
    },

    // TODO ještě to poštelovat. promise by mel bejt asi v reader.onload
    import: function() {
      if (confirm('Do you want to backup data before Import?\nAfter backup click on Import again.')) {
        this.export();
        return;
      }
      return new Promise((resolve, reject) => {
        let input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
    
        input.addEventListener('change', (e) => {
          let reader = new FileReader();
          reader.onload = (e) => {
            let dbSource = JSON.parse(e.target.result),
                storeNames = [];
    
            for (let store of dbSource.stores) storeNames.push(store.name);
    
            let tx = this.db.transaction(storeNames, 'readwrite');
        
            tx.oncomplete = () => {
              appCore.log('Database import done!', true);
              resolve();
            };
        
            tx.onerror = (e) => {
              appCore.log(`Database import error: ${e.target.errorCode}`, true);
              reject();
            };

            for (const store of dbSource.stores) {
              let dbstore = tx.objectStore(store.name),
                  delRequest = dbstore.clear();
    
              delRequest.onsuccess = () => {
                for (const item of store.values) 
                  dbstore.add(item);
              } 
            }
          };
          reader.readAsText(e.srcElement.files[0]);
        });
        input.dispatchEvent(new MouseEvent('click'));
      }).then(() => {
        location.reload(false);
      });
    },

    // now only for editing default values on select in ADM_AppStores
    linkStores: function(store) {
      return new Promise(async (resolve) => {
        for (let p of store.properties) {
          if (!p.source) continue;
          p.source.store = this.dbSchema.find(s => s.name == p.source.name);
          await appStores[p.source.name].data({sorted: true}); 
        }
        resolve();
      });
    }
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

  run: function() {
    this.db.open().then(async (isUpdgradeNeeded) => {
      if (isUpdgradeNeeded) await this.db.init();
      
      // now only for editing default values on select in ADM_AppStores
      this.db.dbSchema = await appStores.ADM_AppStores.data();
      
      await this.db.updateSchema();
      this.createAppMap();
    }).catch(err => this.log(err, true));
  },

  createAppMap: async function() {
    const stores = await appStores.ADM_AppStores.data({sorted: true}),
          storeGroups = await appStores.ADM_AppStoreGroups.data({sorted: true});
    let groups = [];

    for (const group of storeGroups) {
      let ul = [];

      for (const storeId of group.stores) {
        const store = stores.find(s => s.id == storeId);
        ul.push(`<li onclick="appCore.loadForm(\'${store.name}\');">${store.title}</li>`);
      }

      groups.push(`
        <table>
          <tr><td colspan="2"><h2>${group.name}</h2></td></tr>
          <tr><td class="groupIcon"><img src="img/${group.icon}.png" /></td><td><ul>${ul.join('')}</ul></td></tr>
        </table>`);
    }

    this.setTitle('Travel Costs');
    document.getElementById('version').innerHTML = this.appVersion;
    document.getElementById('mainContent').innerHTML = `<div id="appMap">${groups.join('')}</div>`;
    document.getElementById('menu').innerHTML = '<li onclick="appCore.testFunc();">Test Func</li>';
  },

  log: function(msg, withAlert = false) {
    console.log(msg);
    if (withAlert) alert(msg);
  },

  loadForm: function(frm) {
    document.getElementById('menu').style.visibility = 'hidden';
    this.contentTabs.clear();
    this.contentTabs.add('grid');
    this.contentTabs.add('edit');
    this.contentTabs.add('chartView');
    this.contentTabs.add('treeView');
    this.contentTabs.active('grid');

    this.currentForm = appStores[frm];
    this.setTitle(this.currentForm.dbSchema.title);
    this.createMenu();
    this.currentForm.data({sorted: true}).then((gridItems) => {
      this.createGrid('grid', this.currentForm.dbSchema, gridItems, true);
      this.createEdit();
    });
  },

  setTitle: function(title) {
    document.getElementById('title').innerHTML = title;
  },

  menuOpen: function() {
    document.getElementById('menu').style.visibility = 'visible';
  },

  menuHide: function(e) {
    e.style.visibility = 'hidden';
  },

  createMenu: async function() {
    let stores = await appStores.ADM_AppStores.data(),
        groups = await appStores.ADM_AppStoreGroups.data(),
        siblings = groups.find(g => g.stores.includes(this.currentForm.dbSchema.id)).stores,
        items = [];
  
    items.push('<li onclick="appCore.createAppMap();">Home</li>'); // link to site map
    items.push('<li class="liDivider">Forms</li>'); // header Forms

    for (const storeId of siblings) {
      const s = stores.find(store => store.id == storeId);
      items.push(`<li onclick="appCore.loadForm(\'${s.name}\');">${s.title}</li>`);
    }

    items.push('<li class="liDivider">---</li>');
    items.push('<li onclick="appCore.editRecord(-1);">New Record</li>');

    //forms functions
    if (this.currentForm.dbSchema.functions)
      for (const func of this.currentForm.dbSchema.functions) {
        items.push(`<li onclick="${func.name}();">${func.title}</li>`);
      }

    document.getElementById('menu').innerHTML = items.join('');
  },

  // Generate Grid view
  createGrid: function(divId, form, gridItems, editable) {
    // THEAD
    let thead = [];
    for (const prop of form.properties) {
      if (prop.hidden || prop.type == 'array') continue;
      thead.push(`<th>${prop.title}</th>`);
    }
  
    // TBODY
    let tbody = []; 
    for (const item of gridItems) {
      let tds = [];
      
      for (const prop of form.properties) {
        if (prop.hidden) continue;
        
        let style = prop.align ? `text-align:${prop.align};` : '',
            val;

        switch (prop.type) {
          case 'array': continue;         
          case 'multiSelect': {
            let tmp = [];
            for (const id of item[prop.name]) 
              tmp.push(prop.source.store.cache.find(d => d.id == id)[prop.source.property]);
            val = tmp.join(', ');
            break;
          }
          case 'select': {
            let srcItem = prop.source.store.cache.find(d => d.id == item[prop.name]);
            if (srcItem !== undefined) {
              style += srcItem.bgColor ? `background-color:${srcItem.bgColor};` : '';
              val = srcItem[prop.source.property];
            }
            break;
          }
          case 'button':
            val = `<button onclick='${prop.funcName}();'></button>`;
            break;
          default:
            val = item[prop.name];
        }
  
        if (val === undefined || val === null) val = '';
  
        if (prop.name == 'bgColor')
          style += val == '' ? '' : `background-color:${val};`;
        
        tds.push(`<td${style != '' ? ` style="${style}"` : ''}>${val}</td>`);
      }
      tbody.push(`<tr${editable ? ` onclick="appCore.editRecord(${item.id});"` : ''}>${tds.join('')}</tr>`);
    }

    document.getElementById(divId).innerHTML = `
      <table class="grid">
        <thead><tr>${thead.join('')}</tr></thead>
        <tbody>${tbody.join('')}</tbody>
      </table>`;
  },
  
  //Generate Edit form
  createEdit: function() {
    let tbody = [];
  
    for (prop of this.currentForm.dbSchema.properties) {
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
        <button onclick="appCore.saveRecord(); return false;">Save</button>
        <button onclick="appCore.cancelEdit(); return false;">Cancel</button>
        <button onclick="appCore.deleteRecord(); return false;" id="btnDelete">Delete</button>
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

        for (let x of prop.source.store.cache) 
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
    this.currentForm.currentRecord = isNew ? {} : this.currentForm.cache.find(x => x.id == id);

    for (prop of this.currentForm.dbSchema.properties) {
      if (prop.hidden) continue;
      if (isNew) { // preset default
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
      } else {
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
    let edit = document.getElementById('edit');
    if (edit.querySelectorAll(':invalid').length > 0) return;
    //TODO check for required multiselect
    let rec = this.currentForm.currentRecord;
  
    for (prop of this.currentForm.dbSchema.properties) {
      if (prop.hidden) continue;
      let elm = edit.querySelector(`#__${prop.name}`);
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

    for (prop of this.currentForm.dbSchema.properties) {
      if (prop.type != 'calc') continue;
      rec[prop.name] = await window[prop.funcName](rec);
    }
    await this.currentForm.iudStoreData(rec.id ? 'update' : 'insert', [rec]);
    this.hideEdit();

    if (this.currentForm.dbSchema.onSaveFunc)
      await window[this.currentForm.dbSchema.onSaveFunc]();

    this.currentForm.data({sorted: true}).then((gridItems) => {
      this.createGrid('grid', this.currentForm.dbSchema, gridItems, true);
    });
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
      for (const store of Object.values(appStores))
        for (const prop of store.dbSchema.properties) {
          if (prop.source && prop.source.name == this.currentForm.dbSchema.name) {
            const storeItems = await store.data();
            if (storeItems.find(x => x[prop.name].includes(this.currentForm.currentRecord.id))) {
              alert(`This record can't be deleted because is used in ${store.dbSchema.title} store!`);
              return;
            }
          }
        }
  
      await this.currentForm.delete([this.currentForm.currentRecord.id]);
      this.hideEdit();
      const itemIndex = this.currentForm.cache.indexOf(this.currentForm.currentRecord);
      this.currentForm.cache.splice(itemIndex, 1);
      this.currentForm.data({sorted: true}).then((gridItems) => {
        this.createGrid('grid', this.currentForm.dbSchema, gridItems, true);
      });
    }
  },

  testFunc: async function() {
 
   }
};

window.addEventListener('load', async () => {
  navigator.serviceWorker
    .register('/TravelCosts/sw_cached_files.js')
    .then(reg => appCore.log('Service Worker: Registered'))
    .catch(err => appCore.log(`Service Worker: Error: ${err}`, true));

  appCore.run();
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}