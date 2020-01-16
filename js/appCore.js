const app = {
  run: async function () {
    try {
      if (await this.DB.open())
        await this.DB.init();

      this.DB.dbSchema = await appStores.ADM_AppStores.data(); // now only for editing default values on select in ADM_AppStores
      await this.DB.updateSchema();
      this.UI.init();
      await this.createAppMap();
    } catch (e) {
      app.log(e, true);
    }
  },

  log: function(msg, withAlert = false) {
    console.log(msg);
    if (withAlert) alert(msg);
  },

  createAppMap: async function () {
    const appMapDiv = document.getElementById('appMap').querySelector('div');

    if (appMapDiv.innerHTML === '') {
      const stores = await appStores.ADM_AppStores.data({ sorted: true }),
        storeGroups = await appStores.ADM_AppStoreGroups.data({ sorted: true }),
        groups = [];

      for (const group of storeGroups) {
        const ul = [];

        for (const storeId of group.stores) {
          const store = stores.find(s => s.id === storeId);
          ul.push(`<li onclick="app.form.load(\'${store.name}\');">${store.title}</li>`);
        }

        groups.push(`
        <table>
          <tr><td colspan="2"><h2>${group.name}</h2></td></tr>
          <tr><td class="groupIcon"><img src="img/${group.icon}.png" /></td><td><ul>${ul.join('')}</ul></td></tr>
        </table>`);
      }

      appMapDiv.innerHTML = groups.join('');
    }

    const divVersion = document.getElementById('version');
    divVersion.innerHTML = localStorage.getItem('appVersion');
    divVersion.style.display = 'block';

    app.UI.setTitle('Travel Costs');
    app.UI.toolBar.clear();
    app.UI.cursor.hide();
    app.UI.footer.hide();
    app.UI.elmMenu.innerHTML = '<li onclick="testFunc();">Test Func</li>';
    app.UI.contentTabs.active('appMap');
    app.UI.elmData.scrollTop = 0;
  },

  downloadDataAsJson: function (data, fileName) {
    const file = new Blob([JSON.stringify(data)], { type: 'text/plain' }),
          url = URL.createObjectURL(file),
          a = document.createElement('a');

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 0);
  },

  fetchData: function(url) {
    return new Promise((resolve, reject) => {
      fetch(url).then(res => {
        if (res.ok && res.status === 200 && res.type === 'basic')
          resolve(res);
        else
          throw new Error('Response was not ok');
      }).catch(err => {
        reject(err);
      });
    });
  },

  DB: {
    db: null,
    dbName: 'TravelCosts',
    dbVersion: 12,
    dbSchema: [],

    open: function() {
      return new Promise((resolve) => {
        let isUpgradeNeeded = false,
          req = window.indexedDB.open(this.dbName, 1); // version always 1

        req.onsuccess = (e) => {
          this.db = e.target.result;
          this.db.onerror = (e) => {
            app.log(`Database Error: ${e.target.errorCode}`, true);
          }

          resolve(isUpgradeNeeded);
        };

        req.onerror = (e) => {
          throw new Error(`Open Database Error: ${e.target.errorCode}`);
        };

        req.onupgradeneeded = (e) => {
          isUpgradeNeeded = true;
          this.db = e.target.result;
          this.db.onerror = (e) => {
            app.log(`Database OnUpgradeNeeded Error: ${e.target.errorCode}`, true);
          };

          for (const store of Object.keys(appStores))
            this.db.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
        };
      });
    },

    init: async function() {
      const stores = [];
      for (const s of Object.values(appStores))
        stores.push(s.dbSchema);

      await appStores.ADM_AppStores.insert(stores);
      await appStores.ADM_AppStoreGroups.insert([
        { id: 1, name: 'Administration', icon: 'adm', index: 4, stores: [1, 2] },
        { id: 2, name: 'Travel Costs & Incomes', icon: 'money', index: 1, stores: [20, 21, 22, 23, 24, 26] },
        { id: 3, name: 'Car', icon: 'car', index: 2, stores: [30, 31, 32, 33, 34, 35] },
        { id: 4, name: 'Global', icon: 'global', index: 3, stores: [10, 11, 12, 13] }
      ]);
      await appStores.ADM_AppSettings.insert([{ id: 1, dbVersion: this.dbVersion }]);
    },

    updateSchema: async function() {
      const settings = await appStores.ADM_AppSettings.getRecordById(1);

      if (settings.dbVersion === this.dbVersion) return;

      if (settings.dbVersion < 5) {
        const g = await appStores.ADM_AppStoreGroups.getRecordById(2);
        g.stores = [20, 21, 22, 23, 24, 26];
        await appStores.ADM_AppStoreGroups.update([g]);
      }

      if (settings.dbVersion < 12) {
        // ADM_AppStores
        const admAppStores = await appStores.ADM_AppStores.getRecordById(1);
        admAppStores.functions = [
          { name: 'app.DB.import', title: 'Import data' },
          { name: 'app.DB.export', title: 'Export data' }
        ];

        // CAR_Drives
        const carDrives = await appStores.ADM_AppStores.getRecordById(30);
        carDrives.functions = [
          { name: 'reports.carDrives.run', title: 'Report Km/Days/Places' },
          { name: 'reports.carDrives2.run', title: 'Report Km/EUR' }
        ];

        // CAR_Refueling
        const carRefueling = await appStores.ADM_AppStores.getRecordById(31);
        carRefueling.functions = [
          { name: 'reports.carRefueling.run', title: 'Report' }
        ];

        // MON_Costs
        const monCosts = await appStores.ADM_AppStores.getRecordById(20);
        monCosts.functions = [
          { name: 'reports.monCosts.run', title: 'Report' }
        ];

        await appStores.ADM_AppStores.update([admAppStores, carDrives, carRefueling, monCosts]);
      }

      settings.dbVersion = this.dbVersion;
      await appStores.ADM_AppSettings.update([settings]);
    },

    export: async function() {
      const data = { stores: [] };

      for (const store of Object.values(appStores)) {
        if (store.dbSchema.name.startsWith('ADM_')) continue;

        data.stores.push({
          name: store.dbSchema.name,
          values: await store.data()
        });
      }

      app.downloadDataAsJson(data, `travelCostsExport_${new Date().toYMD()}.json`);
    },

    // TODO ještě to poštelovat. promise by mel bejt asi v reader.onload
    import: function() {
      if (confirm('Do you want to backup data before Import?\nAfter backup click on Import again.')) {
        this.export();
        return null;
      }
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', (e) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dbSource = JSON.parse(e.target.result),
              storeNames = [];

            for (const store of dbSource.stores) storeNames.push(store.name);

            const tx = this.db.transaction(storeNames, 'readwrite');

            tx.oncomplete = () => {
              app.log('Database import done!', true);
              resolve();
            };

            tx.onerror = (e) => {
              app.log(`Database import error: ${e.target.errorCode}`, true);
              reject();
            };

            for (const store of dbSource.stores) {
              const dbStore = tx.objectStore(store.name),
                delRequest = dbStore.clear();

              delRequest.onsuccess = () => {
                for (const item of store.values)
                  dbStore.add(item);
              }
            }
          };
          reader.readAsText(e.srcElement.files[0]);
        });
        input.dispatchEvent(new MouseEvent('click'));
      }).then(() => location.reload(false));
    },

    linkStores: async function(store) {
      for (const p of store.properties) {
        if (!p.source) continue;
        p.source.store = appStores[p.source.name];
        await p.source.store.data({ sorted: true });
      }
    }
  },

  UI: {
    elmToolBar: null,
    elmFooter: null,
    elmCursor: null,
    elmData: null,
    elmMenu: null,
    elmGrid: null,
    elmEdit: null,

    init: function() {
      this.elmToolBar = document.getElementById('toolBar');
      this.elmFooter = document.getElementById('footer');
      this.elmCursor = document.getElementById('cursor');
      this.elmData = document.getElementById('mainContent');
      this.elmMenu = document.getElementById('menu');
      this.elmGrid = document.getElementById('grid');
      this.elmEdit = document.getElementById('edit');

      this.cursor.init();

      this.elmData.addEventListener('scroll', (e) => {
        if (app.UI.contentTabs.isActive('grid')) {
          const gridFixed = app.UI.elmGrid.querySelector('.grid-fixed');
          if (gridFixed)
            gridFixed.style.left = `-${e.target.scrollLeft}px`;
          app.form.grid.appendRows();
        }
      }, false);

      this.elmEdit.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
      }, false);
    },

    setTitle: function(title) {
      document.getElementById('title').innerHTML = title;
    },

    toolBar: {
      appendHtml: function(tool) {
        app.UI.elmToolBar.innerHTML += tool;
      },

      appendElement: function(elm) {
        app.UI.elmToolBar.appendChild(elm);
      },

      clear: function() {
        app.UI.elmToolBar.innerHTML = '';
      }
    },

    footer: {
      show: function() {
        app.UI.elmFooter.style.display = 'block';
      },

      hide: function() {
        app.UI.elmFooter.style.display = 'none';
      }
    },

    cursor: {
      cursorHeight: 0,
      isVisible: false,
      canDrag: false,
      limitTop: 0,

      init: function () {
        this.show(-100);
        this.cursorHeight = app.UI.elmCursor.clientHeight;
        this.hide();

        app.UI.elmCursor.addEventListener('mousedown', () => this.dragStart());
        app.UI.elmCursor.addEventListener('touchstart', () => this.dragStart());

        document.addEventListener('mouseup', () => this.dragEnd());
        document.addEventListener('touchend', () => this.dragEnd());
        document.addEventListener('mousemove', e => this.dragCursor(e));
        document.addEventListener('touchmove', e => this.dragCursor(e));

        app.UI.elmData.addEventListener('scroll', () => this.updateInfoBox());
      },

      show: function (limitTop) {
        app.UI.elmCursor.style.top = limitTop + 'px';
        app.UI.elmCursor.style.display = 'block';
        this.limitTop = limitTop;
        this.isVisible = true;
      },

      hide: function() {
        app.UI.elmCursor.style.display = 'none';
        this.isVisible = false;
      },

      dragStart: function() {
        this.canDrag = true;
      },

      dragEnd: function() {
        this.canDrag = false;
      },

      dragCursor: function(e) {
        if (!this.canDrag) return;

        const pageY = e.pageY ? e.pageY : e.touches[0].pageY,
              limitBottom = app.UI.elmData.clientHeight + this.cursorHeight;
        let top = pageY - this.cursorHeight / 2;

          // limit top/bottom position
        if (top < this.limitTop)
          top = this.limitTop;
        else if (top > limitBottom)
          top = limitBottom;

        app.UI.elmCursor.style.top = top + 'px';
        this.updateInfoBox();
      },

      updateInfoBox: function() {
        if (!this.isVisible) return;
        const offset = app.UI.elmData.scrollTop - this.limitTop + app.UI.elmCursor.offsetTop + (this.cursorHeight / 2),
              infoData = this.getInfoData(offset);

        app.UI.elmFooter.innerHTML = infoData;
        app.UI.elmFooter.scrollTop = 0;
      }
    },

    menu: {
      open: function() {
        app.UI.elmMenu.style.visibility = 'visible';
      },

      hide: function() {
        app.UI.elmMenu.style.visibility = 'hidden';
      },

      create: async function() {
        const stores = await appStores.ADM_AppStores.data(),
              groups = await appStores.ADM_AppStoreGroups.data(),
              siblings = groups.find(g => g.stores.includes(app.form.current.dbSchema.id)).stores,
              items = [];

        items.push('<li onclick="app.createAppMap();">Home</li>'); // link to site map
        items.push('<li class="liDivider">Forms</li>'); // header Forms

        for (const storeId of siblings) {
          const s = stores.find(store => store.id === storeId);
          items.push(`<li onclick="app.form.load(\'${s.name}\');">${s.title}</li>`);
        }

        //forms functions
        if (app.form.current.dbSchema.functions) {
          items.push('<li class="liDivider">---</li>');
          for (const func of app.form.current.dbSchema.functions) {
            items.push(`<li onclick="${func.name}();">${func.title}</li>`);
          }
        }

        app.UI.elmMenu.innerHTML = items.join('');
      }
    },

    contentTabs: {
      activeTabId: '',

      active: function(name) {
        for (const x of app.UI.elmData.children)
          x.style.display = 'none';

        document.getElementById(name).style.display = 'block';
        this.activeTabId = name;
      },

      isActive: function(name) {
        return name === this.activeTabId;
      }
    }
  },

  form: {
    current: null,

    load: function(frm) {
      this.current = appStores[frm];

      document.getElementById('version').style.display = 'none';
      app.UI.contentTabs.active('grid');
      app.UI.setTitle(this.current.dbSchema.title);
      app.UI.footer.hide();
      app.UI.menu.hide();
      app.UI.menu.create();
      app.UI.cursor.hide();
      app.UI.toolBar.clear();
      app.UI.toolBar.appendHtml('<div class="toolBarIcon" onclick="app.form.record.new();">✹</div>');

      this.current.data({ sorted: true }).then((gridItems) => {
        this.grid.create(this.current.dbSchema, gridItems, true);
        this.edit.create();
      });
    },

    grid: {
      sourceThead: null,
      fixedThead: null,
      tbody: null,
      form: null,
      gridItems: [],
      rowsCount: 0,
      isEditable: false,

      create: function(form, gridItems, editable) {
        this.sourceThead = app.UI.elmGrid.querySelector('.grid-source');
        this.fixedThead = app.UI.elmGrid.querySelector('.grid-fixed');
        this.tbody = app.UI.elmGrid.querySelector('tbody');
        this.form = form;
        this.gridItems = gridItems;
        this.rowsCount = 0;
        this.isEditable = editable;

        // THEAD
        const thead = [],
              theadDivs = [];
        for (const prop of form.properties) {
          if (prop.hidden || prop.type === 'array') continue;
          thead.push(`<th>${prop.title}</th>`);
          theadDivs.push(`<div>${prop.title}</div>`);
        }

        this.sourceThead.innerHTML = `<tr>${thead.join('')}</tr>`;
        this.fixedThead.innerHTML = theadDivs.join('');
        this.tbody.innerHTML = '';
        this.appendRows();
      },

      setFixedThead: function() {
        const widths = [];

        this.sourceThead.querySelectorAll('th').forEach(elm => {
          widths.push(getComputedStyle(elm, null).width);
        });
        this.fixedThead.querySelectorAll('div').forEach((elm, i) => elm.style.width = widths[i]);
        this.fixedThead.style.width = getComputedStyle(app.UI.elmGrid.querySelector('.grid'), null).width;
      },

      appendRows: function () {
        const itemsCount = this.gridItems.length;

        while (app.UI.elmGrid.clientHeight - app.UI.elmData.clientHeight - app.UI.elmData.scrollTop < 200 && this.rowsCount < itemsCount) {
          this.tbody.appendChild(this.createRow(this.gridItems[this.rowsCount]));
          this.rowsCount++;
        }

        this.setFixedThead();
      },

      createRow: function(item) {
        const tds = [];

        for (const prop of this.form.properties) {
          if (prop.hidden) continue;

          let style = prop.align ? `text-align:${prop.align};` : '',
              val = '';

          switch (prop.type) {
            case 'array': continue;
            case 'multiSelect': {
              val = item[prop.name].map(id => (prop.source.store.cache.find(d => d.id === id)[prop.source.property])).join(', ');
              break;
            }
            case 'select': {
              const srcItem = prop.source.store.cache.find(d => d.id === item[prop.name]);
              if (srcItem) {
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

          if (!val) val = '';

          if (prop.name === 'bgColor')
            style += val === '' ? '' : `background-color:${val};`;

          tds.push(`<td${style !== '' ? ` style="${style}"` : ''}>${val}</td>`);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = tds.join('');
        if (this.isEditable)
          tr.addEventListener('click', () => app.form.record.edit(item.id));

        return tr;
      },

      insertRow: function (index, item) {
        if (index < this.rowsCount || index === 0) {
          this.tbody.insertBefore(this.createRow(item), this.tbody.children[index]);
          this.rowsCount++;
        }
      },

      updateRow: function (oldIndex, newIndex, item) {
        this.deleteRow(oldIndex);
        this.insertRow(newIndex, item);
      },

      deleteRow: function (index) {
        const row = this.tbody.children[index];
        if (row) {
          this.tbody.removeChild(row);
          this.rowsCount--;
        }
      }
    },

    edit: {
      create: function() {
        const tbody = [],
              form = app.UI.elmEdit.querySelector('form'),
              table = form.querySelector('table');

        for (const prop of app.form.current.dbSchema.properties) {
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

        form.id = `form_${app.form.current.dbSchema.name}`;
        table.innerHTML = tbody.join('');
      },

      getInput: function(prop) {
        const required = prop.required ? 'required' : '',
              readonly = prop.readonly ? 'readonly' : '',
              elmId = `form_${app.form.current.dbSchema.name}_${prop.name}`;

        switch (prop.type) {
          case 'int': return `<input type="number" id="${elmId}" ${readonly} ${required}>`;
          case 'num': return `<input type="number" id="${elmId}" ${readonly} ${required} step="0.001" min="0">`;
          case 'date': return `<input type="date" id="${elmId}" ${readonly} ${required}>`;
          case 'text': return `<input type="text" id="${elmId}" ${readonly} ${required} autocomplete="on">`;
          case 'textarea': return `<textarea id="${elmId}" ${readonly} ${required}></textarea>`;
          case 'bool': return `<input type="checkbox" id="${elmId}" ${readonly}>`;
          case 'select':
          case 'multiSelect': {
            const select = xSelect(elmId),
                  data = [];

            for (const x of prop.source.store.cache)
              data.push({ value: x.id, name: x[prop.source.property] });

            select.create(data, prop.type === 'multiSelect');

            if (prop.source.onchangeFunc === undefined)
              delete select.element.dataset.onchange;
            else
              select.element.dataset.onchange = prop.source.onchangeFunc;

            return select.element.outerHTML;
          }
          default: return '';
        }
      },

      cancel: function() {
        this.hide();
      },

      hide: function() {
        app.UI.elmEdit.style.display = 'none';
      }
    },

    record: {
      current: null,

      new: function() {
        this.edit(-1);
      },

      edit: async function(id) {
        let isNew = id === -1;
        document.getElementById('btnDelete').disabled = isNew;
        this.current = isNew ? {} : app.form.current.cache.find(x => x.id === id);

        for (const prop of app.form.current.dbSchema.properties) {
          if (prop.hidden) continue;

          const elmId = `form_${app.form.current.dbSchema.name}_${prop.name}`;
          if (isNew) { // preset default
            switch (prop.type) {
              case 'calc':
              case 'readOnly':
              case 'button':
              case 'properties':
              case 'variable': continue;
              case 'date': document.getElementById(elmId).value = new Date().toYMD(); break;
              case 'select': if (prop.default) xSelect(elmId).set(prop.default); break;
              case 'multiSelect': if (prop.default) xSelect(elmId).set(prop.default); break;
              default: document.getElementById(elmId).value = '';
            }
          } else {
            let rec = this.current;
            switch (prop.type) {
              case 'calc':
              case 'readOnly':
              case 'button': continue;
              case 'bool': document.getElementById(elmId).toggleAttribute('checked', rec[prop.name]); break;
              case 'select': xSelect(elmId).set([rec[prop.name]]); break;
              case 'multiSelect': xSelect(elmId).set(rec[prop.name]); break;
              case 'properties': {
                await app.DB.linkStores(rec);
                let table = document.getElementById(`__table_${prop.name}`),
                    props = rec[prop.name].filter(x => x.source),
                    trs = [];

                for (const x of props)
                  trs.push(`<tr><td>${x.title}:</td><td>${app.form.edit.getInput(x)}</td></tr>`);
                table.innerHTML = trs.join('');
                for (const x of props) {
                  if (!x.default) continue;
                  xSelect(`form_${app.form.current.dbSchema.name}_${x.name}`).set(x.default);
                }
                break;
              }
              default: document.getElementById(elmId).value = rec[prop.name] || ''; break;
            }
          }
        }

        app.UI.elmEdit.style.display = 'block';
      },

      save: async function() {
        if (app.UI.elmEdit.querySelectorAll(':invalid').length > 0) return;
        //TODO check for required multiSelect
        const rec = this.current,
              isNew = !rec.id;

        for (const prop of app.form.current.dbSchema.properties) {
          if (prop.hidden) continue;
          const elmId = `form_${app.form.current.dbSchema.name}_${prop.name}`,
                elm = app.UI.elmEdit.querySelector(`#${elmId}`);
          switch (prop.type) {
            case 'calc':
            case 'readOnly':
            case 'button': continue;
            case 'bool': rec[prop.name] = elm.checked; break;
            case 'int':
            case 'num': rec[prop.name] = elm.value === '' ? null : Number(elm.value); break;
            case 'select': rec[prop.name] = xSelect(elmId).get()[0]; break;
            case 'multiSelect': rec[prop.name] = xSelect(elmId).get(); break;
            case 'properties':
              for (const x of rec[prop.name]) {
                if (!x.source) continue;
                x.default = xSelect(`form_${app.form.current.dbSchema.name}_${x.name}`).get();
              }
              break;
            default: rec[prop.name] = elm.value === '' ? null : elm.value;
          }
        }

        for (const prop of app.form.current.dbSchema.properties) {
          if (prop.type !== 'calc') continue;
          rec[prop.name] = await window[prop.funcName](rec);
        }

        await app.form.current.iudStoreData(isNew ? 'insert' : 'update', [rec]);
        app.form.edit.hide();

        if (app.form.current.dbSchema.onSaveFunc)
          await window[app.form.current.dbSchema.onSaveFunc]();

        const oldIndex = isNew ? null : app.form.current.cache.indexOf(rec);
        await app.form.current.data({ sorted: true });
        const newIndex = app.form.current.cache.indexOf(rec);

        if (isNew)
          app.form.grid.insertRow(newIndex, rec);
        else
          app.form.grid.updateRow(oldIndex, newIndex, rec);
      },

      delete: async function() {
        if (confirm('Do you want to delete this record?')) {
          //check if can be deleted
          for (const store of Object.values(appStores))
            for (const prop of store.dbSchema.properties) {
              if (prop.source && prop.source.name === app.form.current.dbSchema.name) {
                const storeItems = await store.data();
                if (storeItems.find(x => {
                  if (Array.isArray(x[prop.name]))
                    return x[prop.name].includes(this.current.id);
                  else
                    return x[prop.name] === this.current.id;
                })) {
                  alert(`This record can't be deleted because is used in ${store.dbSchema.title} store!`);
                  return;
                }
              }
            }

          await app.form.current.delete([this.current.id]);
          app.form.edit.hide();
          const itemIndex = app.form.current.cache.indexOf(this.current);
          app.form.current.cache.splice(itemIndex, 1);
          app.form.grid.deleteRow(itemIndex);
        }
      }
    }
  },

  canvas: {
    drawRect: function (ctx, x, y, width, height, fillStyle, strokeStyle, angle) {
      const tX = x, tY = y;
      if (angle !== 0 || angle !== undefined) {
        ctx.save();
        ctx.translate(tX, tY);
        ctx.rotate(angle * Math.PI / 180);
        x = 0;
        y = 0;
      }
      if (fillStyle !== undefined) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(x, y, width, height);
      }
      if (strokeStyle !== undefined) {
        ctx.strokeStyle = strokeStyle;
        ctx.strokeRect(x, y, width, height);
      }
      if (angle !== 0 || angle !== undefined) {
        ctx.translate(-tX, -tY);
        ctx.restore();
      }
    },

    drawText: function (ctx, text, x, y, fillStyle, strokeStyle, font, angle) {
      const tX = x, tY = y;
      if (angle !== 0 || angle !== undefined) {
        ctx.save();
        ctx.translate(tX, tY);
        ctx.rotate(angle * Math.PI / 180);
        x = 0;
        y = 0;
      }
      if (font !== undefined) ctx.font = font;
      if (fillStyle !== undefined) {
        ctx.fillStyle = fillStyle;
        ctx.fillText(text, x, y);
      }
      if (strokeStyle !== undefined) {
        ctx.strokeStyle = strokeStyle;
        ctx.strokeText(text, x, y);
      }
      if (angle !== 0 || angle !== undefined) {
        ctx.translate(-tX, -tY);
        ctx.restore();
      }
    }
  }
};

window.addEventListener('load', async () => {
  // my way to update cache (:P)
  if (await updateAppCache('TravelCosts'))
    window.location.reload(true);

  navigator.serviceWorker
    .register('/TravelCosts/sw_cached_files.js')
    .then(() => app.log('Service Worker: Registered'))
    .catch(err => app.log(`Service Worker: Error: ${err}`, true));

  await app.run();

  // run demo report if search param is demoReport
  reports.runDemo();
});

var updateAppCache = async function (appName) {
  return app.fetchData('/TravelCosts/updates.json').then(async (res) => {
    const json = await res.json();
    let ver = localStorage.getItem('appVersion');

    // collect files for update
    const files = new Set();
    for (const u of json.updates)
      if (ver == null || u.version > ver) {
        ver = u.version;
        for (const f of u.files)
          files.add(f);
      }

    // nothing to update
    if (files.size === 0) return false;

    console.log('Update: Caching Files');
    const cache = await caches.open(appName);

    for (const key of files.keys()) {
      await cache.delete(key);
      await cache.add(key);
    }

    // await cache.addAll(files); // <= this doesn't work

    localStorage.setItem('appVersion', ver);
    return true;
  }).catch(err => {
    console.log('App Update:', err);
    return false;
  });
};
