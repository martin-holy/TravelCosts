var aaf = aaf || {};
aaf.currentForm = {};
aaf.db = null;
aaf.dbName = "AppsAndForms";
aaf.dbVersion = 1;
aaf.dbSchema = {};

window.addEventListener('load', async () => {
  navigator.serviceWorker
    .register('/TravelCosts/sw_cached_files.js')
    .then(reg => aaf.log('Service Worker: Registered'))
    .catch(err => aaf.log(`Service Worker: Error: ${err}`, true));

  //INFO not possible in onUpgradeNeeded
  let res = await fetch("dbSchema.json")
      resJson = await res.json();
  aaf.dbSchema = resJson.stores;

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

    for (let store of aaf.dbSchema) {
      let dbStore = aaf.db.createObjectStore(store.name, { keyPath: "id", autoIncrement: true });
      if (store.indexes) {
        for (let index of store.indexes) {
          dbStore.createIndex(index.name, index.keyPath, index.params);
        }
      }
    }
  };
};

aaf.insertUpdateInitDBData = async () => {
  await aaf.insertStoreData('ADM_AppStores', aaf.dbSchema);
  await aaf.insertStoreData('ADM_AppStoreGroups', [{ name: "Administration", icon: "0x1F60E", index: 1000, stores: [1,2] }]);
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

aaf.exportData = async () => {
  let data = {stores: []},
      stores = await aaf.getStoreRecords("ADM_AppStores");
  
  for (let store of stores) {
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

aaf.dbLoadFinished = async () => {
  aaf.log("openDb: Load Finished");
  aaf.dbSchema = await aaf.getStoreRecords("ADM_AppStores");
  aaf.dbSchema.forEach(x => aaf.linkStores(x));
  aaf.createAppMap();
}

aaf.linkStores = (form) => {
  form.properties.filter(x => x.source).forEach(async function (x) {
    //TODO vyhledani storu se dela znova i v getStoreRecords
    x.source.store = aaf.dbSchema.find(s => s.name == x.source.name);
    await aaf.getStoreRecords(x.source.name, true); });

  form.properties.filter(x => x.type == "array").forEach(x => aaf.linkStores(x));
};

aaf.createAppMap = async () => {
  let stores = await aaf.getStoreRecords("ADM_AppStores"),
      storeGroups = await aaf.getStoreRecords("ADM_AppStoreGroups", true),
      am = '<div id="appMap">';

  for (let group of storeGroups) {
    am += `<table><tr><td colspan="2"><h2>${group.name}</h2></td></tr>
           <tr><td class="emojiIcon">${String.fromCodePoint(group.icon)}</td><td><ul>`;

    for (let storeId of group.stores) {
      let store = stores.find(s => s.id == storeId);
      am += `<li><a href="#" onclick="aaf.loadForm(\'${store.name}\');">${store.title}</a></li>`;
    }
    am += '</ul></td></tr></table>';
  }

  am += '</div>';
  document.getElementById("mainContent").innerHTML = am;
}

aaf.getStoreRecords = (name, sorted = false) => {
  return new Promise((resolve, reject) => {
    let store = aaf.dbSchema.find(store => store.name == name);
    if (store.data) {
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
        store.data = sorted && store.orderBy ? data.orderBy(store.orderBy, store.orderAsc) : data;
        resolve(store.data);
      }
    };

    request.onerror = (e) => {
      reject(e.target.errorCode);
      aaf.log(`getStoreRecords: ${e.target.errorCode}`, true);
    };
  });
};

aaf.getStoreRecordById = async (name, id) => {
  let storeRecords = await aaf.getStoreRecords(name);
  return storeRecords.find(rec => rec.id == id);
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
  await aaf.createGrid();
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
      siblings = groups.find(g => g.stores.includes(aaf.currentForm.id)).stores;
    
  //link to site map
  let items = '<li onclick="aaf.createAppMap();aaf.menuButtonClick();">Home</li>';
  //header Forms
  items += '<li class="liDivider">Forms</li>';
  siblings.forEach(storeId => {
    let s = stores.find(store => store.id == storeId);
    items += `<li onclick="aaf.loadForm(\'${s.name}\');">${s.title}</li>`;
  });
  items += '<li class="liDivider">---</li>';
  items += '<li onclick="aaf.editRecord(-1);aaf.menuButtonClick();">New Record</li>';
  //forms functions
  if (aaf.currentForm.functions)
    for (let func of aaf.currentForm.functions) {
      items += `<li onclick="${func.name}();aaf.menuButtonClick();">${func.title}</li>`;
    }

  document.getElementById("menu").innerHTML = items;
};

//Generate Grid view
aaf.createGrid = async (form = aaf.currentForm, gridItems = null, editable = true) => {
  //to podtim se dela uz v linkStores
  /*for (let prop of form.properties) {
    if (prop.source)
      await aaf.getStoreRecords(prop.source.name, true);
  }*/

  let header = "";
  for (let prop of form.properties) {
    if (!prop.hidden)
      header += `<th>${prop.title}</th>`;
  }

  let body = "";
  if (gridItems == null)
    gridItems = await aaf.getStoreRecords(form.name, true);

  for (let item of gridItems) {
    body += editable ? `<tr onclick="aaf.editRecord(${item.id});">` : '<tr>';
    for (let prop of form.properties) {
      if (prop.hidden) continue;
      let val,
          style = prop.align ? `text-align:${prop.align};` : '';
      if (prop.source) {
        if (prop.type == 'multiSelect') {
          let tmp = [];
          for (v of item[prop.name]) 
            tmp.push(prop.source.store.data.find(d => d.id == v)[prop.source.property]);
          val = tmp.join(',');
        }
        else {
          let srcItem = prop.source.store.data.find(d => d.id == item[prop.name]);
          style += srcItem.bgColor ? `background-color:${srcItem.bgColor};` : '';
          val = srcItem[prop.source.property];
        }
      } else 
        val = item[prop.name];

      if (val === undefined || val === null) val = '';

      if (prop.name == 'bgColor')
        style += val == '' ? '' :  `background-color:${val};`;

      if (prop.type == 'button')
        val = `<button onclick='${prop.funcName}();'></button>`;
      
      body += `<td${style != '' ? ` style="${style}"` : ''}>${val}</td>`;
    }
    body += '</tr>';
  }

  document.getElementById('grid').innerHTML = `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
};

//Generate Edit form
aaf.createEdit = () => {
  let edit = '<table>';
  for (prop of aaf.currentForm.properties) {
    if (prop.type == 'calc' || prop.type == 'readOnly' || prop.type == 'button' || prop.hidden) continue;
    edit += `<tr><td>${prop.title}:</td><td>${aaf.getInput(prop)}</td></tr>`;
  }

  edit += '</table>';
  edit += '<div>';
  edit += '<button onclick="aaf.saveRecord(); return false;">Save</button>';
  edit += '<button onclick="aaf.cancelEdit(); return false;">Cancel</button>';
  edit += '<button onclick="aaf.deleteRecord(); return false;" id="btnDelete">Delete</button>';
  edit += '</div>';

  document.getElementById('edit').innerHTML = edit;
};

aaf.editRecord = async (id) => {
  var isNew = id == -1;
  document.getElementById('btnDelete').disabled = isNew;
  aaf.currentForm.currentRecord = isNew ? {} : await aaf.getStoreRecordById(aaf.currentForm.name, id);
  if (isNew) { // preset default
    for (prop of aaf.currentForm.properties) {
      if (prop.type == 'calc' || prop.type == 'readOnly' || prop.type == 'button' || prop.hidden) continue;
      let elm = document.getElementById(`__${prop.name}`);
      elm.value = '';
      if (prop.type == 'select')
        elm.value = 1;
    }
  } else {
    for (prop of aaf.currentForm.properties) {
      if (prop.type == 'calc' || prop.type == 'readOnly' || prop.type == 'button' || prop.hidden) continue;
      let elm = document.getElementById(`__${prop.name}`);
      switch (prop.type) {
        case 'bool':
          elm.toggleAttribute('checked', aaf.currentForm.currentRecord[prop.name]);
          break;
        case 'multiSelect':
          multiSelect(`__${prop.name}`).set(aaf.currentForm.currentRecord[prop.name]);
        break;
        default:
          elm.value = aaf.currentForm.currentRecord[prop.name] || '';
          break;
      }       
    }
  }

  document.getElementById('edit').style.display = 'block';
};

aaf.saveRecord = async () => {
  if (document.querySelector('#edit').querySelectorAll(':invalid').length > 0) return;
  //TODO check for required multiselect

  for (prop of aaf.currentForm.properties) {
    if (prop.type == 'calc' || prop.type == 'readOnly' || prop.type == 'button' || prop.hidden) continue;
    let val = document.getElementById(`__${prop.name}`).value;
    val = val == '' ? null : val;
    switch (prop.type) {
      case 'bool': val = document.getElementById(`__${prop.name}`).checked; break;
      case 'int':
      case 'num':
      case 'select': val = Number(val); break;
      case 'multiSelect': val = multiSelect(`__${prop.name}`).get(); break;
    }
    aaf.currentForm.currentRecord[prop.name] = val;
  }

  for (prop of aaf.currentForm.properties) {
    if (prop.type != 'calc') continue;
    aaf.currentForm.currentRecord[prop.name] = await window[prop.funcName](aaf.currentForm.currentRecord);
  }

  let tx = aaf.db.transaction([aaf.currentForm.name], 'readwrite'),
      store = tx.objectStore(aaf.currentForm.name);
      
  tx.oncomplete = async () => {
    aaf.hideEdit();
    delete aaf.currentForm.data;
    if (aaf.currentForm.onSaveFunc)
      await window[aaf.currentForm.onSaveFunc]();
    aaf.createGrid();
  };

  if (aaf.currentForm.currentRecord.id)
    store.put(aaf.currentForm.currentRecord);
  else
    store.add(aaf.currentForm.currentRecord);
};

//Generate input for editing
aaf.getInput = (prop) => {
  let required = prop.required ? 'required' : '',
      readonly = prop.readonly ? 'readonly' : '';

  switch (prop.type) {
    case 'int':
      return `<input type="number" id="__${prop.name}" ${readonly} ${required}>`;
    case 'num':
      return `<input type="text" id="__${prop.name}" ${readonly} ${required} pattern="^[0-9]+(\.[0-9]+)?$">`;
    case 'date':
      return `<input type="date" id="__${prop.name}" ${readonly} ${required}>`;
    case 'text':
      return `<input type="text" id="__${prop.name}" ${readonly} ${required}>`;
    case 'textarea':
      return `<textarea id="__${prop.name}" ${readonly} ${required}></textarea>`;
    case 'select':  {
      let out = `<select id="__${prop.name}" ${readonly} ${required}>`;
      for (rec of prop.source.store.data) {
        out += `<option value="${rec.id}">${rec[prop.source.property]}</option>`;
      }
      out += '</select>';
      return out;
    }
    case 'multiSelect': {
      let out =  `<div id="__${prop.name}" data-${required} class="multiSelectDropDown">
                    <div onclick="multiSelect('__${prop.name}').show();">
                      <div class="selectedOptions"></div>
                      <div class="button">⮟</div>
                    </div>
                    <ul>`;
      for (rec of prop.source.store.data) {
        out += `<li value="${rec.id}" onclick="multiSelect('__${prop.name}').select(this);">${rec[prop.source.property]}</li>`;
      }
      out += '</ul></div>';
      return out;
    }
    case 'bool':
      return `<input type="checkbox" id="__${prop.name}" ${readonly}>`;
    default:
      return '';
  }
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
      aaf.createGrid();
    };
  }
};

aaf.closeDB = () => {
  aaf.db.close();
};

//#region HTML5 Canvas
aaf.Canvas = {};

aaf.Canvas.drawRect = function(ctx, X, Y, width, height, fillStyle, strokeStyle, angle) {
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
};

aaf.Canvas.drawText = function(ctx, text, X, Y, fillStyle, strokeStyle, font, angle, baseline = 'middle') {
  let tX = X, tY = Y;
  if (angle != 0 || angle !== undefined) {
    ctx.save();
    ctx.translate(tX, tY);
    ctx.rotate(angle * Math.PI / 180);
    X = 0;
    Y = 0;
  }
  ctx.font = font;
  ctx.textBaseline = baseline;
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
};

aaf.Canvas.drawCalendar = function(yearFrom, yearTo, ctx) {
  var pxPerDay = 2;
  var yWidth, mWidth;
  var yY = 180, mY = 40; //offset from top for year and month
  var yX = 30, mX = 5; //offset from left for year and month
  var X = 0.5, Y = 0.5; //for smooth edges
  var yHeight = 250, mHeight = 50; //height of year and month rect
  var color = 'rgba(0, 0, 0, {0})';
  //Years
  for (var i = yearFrom ; i < yearTo + 1 ; i++) {
    yWidth = (daysInYear(i) * pxPerDay);
    this.drawRect(ctx, X, Y, yWidth, yHeight, color.format(0.3), color.format(1));
    this.drawText(ctx, i, X + yX, yY, color.format(0.4), undefined, '150px serif');

    //Months
    for (var j = 0; j < 12; j++) {
      mWidth = new Date(i, j, 0).getDate() * pxPerDay;
      this.drawRect(ctx, X, Y, mWidth, mHeight, color.format(0.2), color.format(1));
      this.drawText(ctx, j + 1, X + mX, mY, color.format(1), undefined, '42px serif');

      X += mWidth;
    }
  }
};
//#endregion

aaf.getTreeBlock = function(properties, data) {
  let output = '<ul>';
  for (let item of data) {
    output += '<li>';
    for (let prop of properties) {
      let val, style = '';
      if (prop.type === 'array') {
        output += aaf.getTreeBlock(prop.properties, item[prop.name]);
      } else {
        if (prop.source) {
          let srcItem = prop.source.store.data.find(d => d.id == item[prop.name]);
          style += srcItem.bgColor ? `background-color:${srcItem.bgColor};` : '';
          val = srcItem[prop.source.property];
          //val = '&nbsp;&nbsp;'
        } else
          val = item[prop.name];

        output += `<div${style != '' ? ` style="${style}"` : ''}>${val}</div>`;
      }
    }
    output += '</li>';
  }


  output += '</ul>';
  return output;
};