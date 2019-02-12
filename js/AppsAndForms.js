var aaf = aaf || {};
aaf.currentForm = {};
aaf.db = null;
aaf.dbName = "AppsAndForms";
aaf.dbVersion = 1;
aaf.dbSchema = [];

window.addEventListener('load', async () => {
  navigator.serviceWorker
    .register('/TravelCosts/sw_cached_files.js')
    .then(reg => aaf.log('Service Worker: Registered'))
    .catch(err => aaf.log(`Service Worker: Error: ${err}`, true));

  aaf.openDb();
});

aaf.log = (msg, withAlert = false) => {
  console.log(msg);
  if (withAlert) alert(msg);
};

aaf.openDb = () => {
  aaf.log("openDb ...");
  let isUpdgradeNeeded = false,
      req = window.indexedDB.open(aaf.dbName, aaf.dbVersion);

  req.onsuccess = (e) => {
    aaf.db = e.target.result;
    aaf.db.onerror = (e) => {
      aaf.log("Database error: " + e.target.errorCode, true);
    }
    aaf.log("openDb: done");
    if (isUpdgradeNeeded) {
      aaf.insertUpdateInitDBData();
    } else {
      aaf.dbLoadFinished();
    }
  };

  req.onerror = (e) => {
    aaf.log("openDb:" + e.target.errorCode, true);
  };

  req.onupgradeneeded = (e) => {
    aaf.log("openDb.onupgradeneeded");
    isUpdgradeNeeded = true;
    aaf.db = e.target.result;
    aaf.db.onerror = (e) => {
      aaf.log("openDb.onupgradeneeded: " + e.target.errorCode, true);
    };

    appStores.forEach(store => aaf.db.createObjectStore(store.name, { keyPath: "id", autoIncrement: true }));
  };
};

aaf.insertUpdateInitDBData = async () => {
  await aaf.insertStoreData('ADM_AppStores', appStores);
  await aaf.insertStoreData('ADM_AppStoreGroups', [
    { name: 'Administration', icon: '0x1F60E', index: 4, stores: [1,2] },
    { name: 'Travel Costs & Incomes', icon: '0x1F92A', index: 1, stores: [20,21,22,23,24,25,26]},
    { name: 'Car', icon: '0x1F3DE', index: 2, stores: [30,31,32,33,34,35]},
    { name: 'Global', icon: '0x1F30D', index: 3, stores: [10,11,12,13]}
  ]);
  aaf.dbLoadFinished();
};

aaf.insertStoreData = (storeName, data) => {
  return new Promise(async (resolve, reject) => {
    let tx = aaf.db.transaction([storeName], "readwrite"),
        store = tx.objectStore(storeName);

    tx.oncomplete = () => {
      aaf.log("All data inserted/updated in database!");
      resolve();
    };

    tx.onerror = (e) => {
      aaf.log("There was an error:" + e.target.errorCode, true);
      reject();
    };

    data.forEach(d => { store.add(d); });
  });
};

aaf.dbLoadFinished = async () => {
  aaf.log("openDb: Load Finished");
  aaf.dbSchema = await aaf.getStoreRecords("ADM_AppStores");
  aaf.dbSchema.forEach(x => aaf.linkStores(x));
  aaf.createAppMap();
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

aaf.linkStores = (store) => {
  store.properties.filter(x => x.source).forEach(async function (x) {
    x.source.store = aaf.dbSchema.find(s => s.name == x.source.name);
    await aaf.getStoreRecords(x.source.name, true); 
  });
};

aaf.createAppMap = async () => {
  let stores = await aaf.getStoreRecords("ADM_AppStores"),
      storeGroups = await aaf.getStoreRecords("ADM_AppStoreGroups", true),
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

  document.getElementById("mainContent").innerHTML = `<div id="appMap">${groups.join('')}</div>`;
  document.getElementById('title').innerHTML = 'Travel Costs';
};

aaf.exportData = async () => {
  let data = {stores: []},
      stores = await aaf.getStoreRecords("ADM_AppStores");
  
  for (let store of stores) {
    if (store.name.startsWith('ADM_')) continue;
    data.stores.push({ name: store.name, values: await aaf.getStoreRecords(store.name) });
  }

  let file = new Blob([JSON.stringify(data)], {type: "text/plain"}),
      a = document.createElement("a"),
      url = URL.createObjectURL(file);

  a.href = url;
  a.download = "dataExport.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 0);
};

aaf.importData = () => {
  return new Promise((resolve, reject) => {
    let input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.addEventListener("change", (e) => {
      let reader = new FileReader();
      reader.onload = (e) => {
        let dbSource = JSON.parse(e.target.result),
            storeNames = [];

        dbSource.stores.forEach(store => storeNames.push(store.name));

        let tx = aaf.db.transaction(storeNames, "readwrite");
    
        tx.oncomplete = () => {
          aaf.log("Database import done!");
          alert("Done");
          resolve();
        };
    
        tx.onerror = (e) => {
          aaf.log("There was an error:" + e.target.errorCode, true);
          reject();
        };
    
        dbSource.stores.forEach(store => {
          let dbstore = tx.objectStore(store.name),
              delRequest = dbstore.clear();

          delRequest.onsuccess = () => {
            store.values.forEach(item => dbstore.add(item));
          } 
        });
      };
      reader.readAsText(e.srcElement.files[0]);
    });
    input.dispatchEvent(new MouseEvent("click"));
  });
};

aaf.getStoreRecords = (name, sorted = false) => {
  return new Promise((resolve, reject) => {
    let store = aaf.dbSchema.find(store => store.name == name);
    if (store && store.data) {
      resolve(sorted && store.orderBy ? store.data.orderBy(store.orderBy, store.orderAsc) : store.data);
      return;
    } 

    let tx = aaf.db.transaction([name], "readonly"),
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
        else //app load, aaf.dbSchema is empty now, this is data for aaf.dbSchema
          resolve(data);
      }
    };

    request.onerror = (e) => {
      reject(e.target.errorCode);
      aaf.log(`getStoreRecords: ${e.target.errorCode}`, true);
    };
  });
};

aaf.getStoreRecordById = async (name, id) => {
  return (await aaf.getStoreRecords(name)).find(rec => rec.id == id);
};

//#region aaf.contentTabs
aaf.contentTabs = {};
aaf.contentTabs.id = 'mainContent';

aaf.contentTabs.add = (name) => {
  document.getElementById(aaf.contentTabs.id).innerHTML += `<div id="${name}" style="display: none;"></div>`;
};

aaf.contentTabs.clear = () => {
  document.getElementById(aaf.contentTabs.id).innerHTML = '';
};

aaf.contentTabs.active = (name) => {
  document.getElementById(aaf.contentTabs.id).childNodes.forEach(x => x.style.display = 'none');
  document.getElementById(name).style.display = 'block';
};
//#endregion

aaf.loadForm = async (frm) => {
  document.getElementById('menu').style.visibility = 'hidden';
  aaf.contentTabs.clear();
  aaf.contentTabs.add('grid');
  aaf.contentTabs.add('edit');
  aaf.contentTabs.add('chartView');
  aaf.contentTabs.add('treeView');
  aaf.contentTabs.active('grid');

  aaf.currentForm = aaf.dbSchema.find(store => store.name == frm);
  aaf.createMenu();
  document.getElementById('grid').innerHTML = await aaf.getGrid();
  aaf.createEdit();
  document.getElementById('title').innerHTML = aaf.currentForm.title;
};

aaf.menuButtonClick = function () {
  let menu = document.getElementById('menu');
  menu.style.visibility = menu.style.visibility == 'visible' ? 'hidden' : 'visible';
};

aaf.createMenu = async () => {
  let stores = await aaf.getStoreRecords("ADM_AppStores"),
      groups = await aaf.getStoreRecords("ADM_AppStoreGroups"),
      siblings = groups.find(g => g.stores.includes(aaf.currentForm.id)).stores,
      items = [];
    
  //link to site map
  items.push('<li onclick="aaf.createAppMap();aaf.menuButtonClick();">Home</li>');
  //header Forms
  items.push('<li class="liDivider">Forms</li>');
  siblings.forEach(storeId => {
    let s = stores.find(store => store.id == storeId);
    items.push(`<li onclick="aaf.loadForm(\'${s.name}\');">${s.title}</li>`);
  });
  items.push('<li class="liDivider">---</li>');
  items.push('<li onclick="aaf.editRecord(-1);aaf.menuButtonClick();">New Record</li>');
  //forms functions
  if (aaf.currentForm.functions)
    for (let func of aaf.currentForm.functions) {
      items.push(`<li onclick="${func.name}();aaf.menuButtonClick();">${func.title}</li>`);
    }

  document.getElementById("menu").innerHTML = items.join('');
};

// Generate Grid view
aaf.getGrid = async (form = aaf.currentForm, gridItems = null, editable = true) => {
  let thead = [];
  for (let prop of form.properties) {
    if (prop.hidden || prop.type == 'array') continue;
    thead.push(`<th>${prop.title}</th>`);
  }

  let tbody = [];
  if (gridItems == null) gridItems = await aaf.getStoreRecords(form.name, true);

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
};

//Generate Edit form
aaf.createEdit = async () => {
  let tbody = [];

  for (prop of aaf.currentForm.properties) {
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
        tbody.push(`<tr><td>${prop.title}:</td><td>${aaf.getInput(prop)}</td></tr>`);
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
};

//Generate input for editing
aaf.getInput = (prop) => {
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
      prop.source.store.data.forEach(x => data.push({ value: x.id, name: x[prop.source.property] }));
      select.create(data, prop.type == 'multiSelect');
      if (prop.source.onchangeFunc === undefined)
        delete select.element.dataset.onchange;
      else select.element.dataset.onchange = prop.source.onchangeFunc;
      return select.element.outerHTML;
    }
    default: return '';
  }
};

aaf.editRecord = async (id) => {
  let isNew = id == -1;
  document.getElementById('btnDelete').disabled = isNew;
  aaf.currentForm.currentRecord = isNew ? {} : await aaf.getStoreRecordById(aaf.currentForm.name, id);
  
  if (isNew) { // preset default
    for (prop of aaf.currentForm.properties) {
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
    for (prop of aaf.currentForm.properties) {
      if (prop.hidden) continue;
      let rec = aaf.currentForm.currentRecord;
      switch (prop.type) {
        case 'calc':
        case 'readOnly':
        case 'button': continue;
        case 'bool': document.getElementById(`__${prop.name}`).toggleAttribute('checked', rec[prop.name]); break;
        case 'select': xSelect(`__${prop.name}`).set([rec[prop.name]]); break;
        case 'multiSelect': xSelect(`__${prop.name}`).set(rec[prop.name]); break;
        case 'properties':
          aaf.linkStores(rec);
          let table = document.getElementById(`__table_${prop.name}`),
              props = rec[prop.name].filter(x => x.source),
              trs = [];
          
          props.forEach(x => trs.push(`<tr><td>${x.title}:</td><td>${aaf.getInput(x)}</td></tr>`));
          table.innerHTML = trs.join('');
          props.filter(x => x.default).forEach(x => xSelect(`__${x.name}`).set(x.default));
          break;
        default: document.getElementById(`__${prop.name}`).value = rec[prop.name] || ''; break;
      }       
    }
  }

  document.getElementById('edit').style.display = 'block';
};

aaf.saveRecord = async () => {
  if (document.querySelector('#edit').querySelectorAll(':invalid').length > 0) return;
  //TODO check for required multiselect
  let rec = aaf.currentForm.currentRecord;

  for (prop of aaf.currentForm.properties) {
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
      case 'properties': rec[prop.name].filter(x => x.source).forEach(x => x.default = xSelect(`__${x.name}`).get()); break;
      default: rec[prop.name] = elm.value == '' ? null : elm.value;
    }
  }

  for (prop of aaf.currentForm.properties) {
    if (prop.type != 'calc') continue;
    rec[prop.name] = await window[prop.funcName](rec);
  }

  let tx = aaf.db.transaction([aaf.currentForm.name], 'readwrite'),
      store = tx.objectStore(aaf.currentForm.name);
      
  tx.oncomplete = async () => {
    aaf.hideEdit();
    delete aaf.currentForm.data;
    if (aaf.currentForm.onSaveFunc)
      await window[aaf.currentForm.onSaveFunc]();
    document.getElementById('grid').innerHTML = await aaf.getGrid();
  };

  if (rec.id) store.put(rec); else store.add(rec);
};

//Cancel Edit
aaf.cancelEdit = () => {
  aaf.hideEdit();
};

//Hide Edit form
aaf.hideEdit = () => {
  document.getElementById('edit').style.display = 'none';
};

//Delete Record
aaf.deleteRecord = async () => {
  if (confirm('Do you want to delete this record?')) {
    //check if can be deleted
    for (let store of aaf.dbSchema) {
      for (let prop of store.properties) {
        if (prop.source && prop.source.name == aaf.currentForm.name) {
          let storeItems = await aaf.getStoreRecords(store.name);
          if (storeItems.filter(item => item[prop.name] == aaf.currentForm.currentRecord.id).length > 0) {
            alert(`This record can't be deleted because is used in ${store.title} store!`);
            return;
          }
        }
      }
    }

    var request = aaf.db.transaction([aaf.currentForm.name], "readwrite")
                        .objectStore(aaf.currentForm.name)
                        .delete(aaf.currentForm.currentRecord.id);
    request.onsuccess = () => {
      aaf.hideEdit();
      delete aaf.currentForm.data;
      document.getElementById('grid').innerHTML = aaf.getGrid();
    };
  }
};

admStoreDefaults = () => {
  let storeSelect = xSelect('__storeId'),
      selectedStore = storeSelect.get()[0],
      propertySelect = xSelect('__property'),
      propertyTd = document.getElementById('__td_property');

      //bude potreba si ulozit naposledy vybrany data a podle toho generovat
      //uplne jinak, defaults budu ukladat dovnou do schematu, udelam edit kterej bude editovat jen defaults ve schematu

  if (storeSelect.element.dataset.lastSelected != selectedStore) {

    storeSelect.element.dataset.lastSelected = selectedStore;

    let store = aaf.dbSchema.find(x => x.id == selectedStore),
        data = [];
    store.properties.filter(x => !x.hidden).forEach(x => data.push({ value: x.name, name: x.name }));
    propertySelect.create(data, false);
    
    propertySelect.element.dataset.onchange = 'admStoreDefaults';
    propertySelect.element.dataset.lastSelected = data[0].name;
    propertyTd.innerHTML = '';
    propertyTd.appendChild(propertySelect.element);
    propertySelect.set([data[0].name]);

  }


};