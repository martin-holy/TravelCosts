var reports = {
  setUpReport: (rep, title) => {
    app.UI.toolBar.clear();
    app.UI.setTitle(title);
    app.UI.contentTabs.active('report');
    app.UI.cursor.hide();
    app.UI.footer.hide();
    document.getElementById('report').innerHTML = `<div id="${rep.id}"></div>`;
  },

  runDemo: function() {
    const repName = (new URLSearchParams(window.location.search)).get('demoReport');
    if (!repName) return;

    app.UI.elmMenu.innerHTML = '<li onclick="app.createAppMap();">Home</li>';

    switch (repName) {
      case 'reportMonCosts': {
        reports.monCosts.run(true);
        break;
      }
      case 'reportCarDrives2': {
        reports.carDrives2.run(true);
        break;
      }
      case 'reportCountriesStay': {
        reports.gloCountriesStay.run(true);
        break;
      }
      case 'reportCountriesStaySum': {
        reports.gloCountriesStaySum.run(true);
        break;
      }
    }
  },

  initReport: async function(rep, demo) {
    if (!document.getElementById(rep.id) || !app.UI.contentTabs.isActive('report')) {
      if (demo) {
        if (!(await this.getDataFromJson(rep))) {
          app.createAppMap();
          return;
        }
      }
      else
        await rep.getDataFromDb();

      rep.init();
    }
  },

  getDataFromJson: async function (rep) {
    return app.fetchData(`/TravelCosts/${rep.fileName}.json`).then(async (res) => {
      const json = await res.json();
      document.getElementById('version').innerHTML = json.date;
      rep.data = json.data;

      return true;
    }).catch(err => {
      app.log(`Error when getting demo data. ${err}`, true);
      return false;
    });
  },

  saveAsJson: function (fileName) {
    const rep = Object.values(this).filter(x => x.fileName === fileName);
    if (!rep) return;
    app.downloadDataAsJson({ date: new Date().toYMD(), data: rep[0].data }, `${fileName}.json`);
  },

  // returns min a max date from data containing dateFrom and dateTo
  getMinMaxDatesFromRange: function (data) {
    let min = '', max = '';
    for (const item of data) {
      if (!min || min > item.dateFrom)
        min = item.dateFrom;
      if (!max || max < item.dateTo)
        max = item.dateTo;
    }
    return [min, max];
  },

  // returns index of year, monthFrom and monthTo from Year-Month hierarchical structure
  getYearMonthIndex: function (offset, rowHeight, groupBy) {
    const rowIndex = Math.floor(offset / rowHeight),
          months = rowIndex * groupBy,
          yearIndex = Math.floor(months / 12),
          monthIndexTo = 11 - (months % 12),
          monthIndexFrom = monthIndexTo - groupBy + 1;

    return [yearIndex, monthIndexFrom, monthIndexTo];
  },

  // returns Year-Month hierarchical structure
  getYearMonthDataStructure: function (yearFrom, yearTo) {
    const data = [];

    for (let y = yearFrom; y < yearTo + 1; y++) {
      const year = { name: y, months: [] };
      for (let m = 1; m < 13; m++)
        year.months.push({ name: m, days: new Date(y, m, 0).getDate(), types: [] });

      data.push(year);
    }

    return data;
  },

  // maps records to Year-Month-Type hierarchical structure
  // amountProperty is used for sum
  mapDateData: function (data, records, amountProperty, yearFrom) {
    for (const rec of records) {
      const y = Number.parseInt(rec.date.substring(0, 4)),
            m = Number.parseInt(rec.date.substring(5, 7)),
            month = data[y - yearFrom].months[m - 1];

      let type = month.types.find(x => x.id === rec.costTypeId);
      if (!type) {
        type = { id: rec.costTypeId, sum: 0, data: [] };
        month.types.push(type);
      }

      type.sum += rec[amountProperty];
      type.data.push(rec);
    }
  },

  // maps records to Year-Month-Type hierarchical structure
  // amountProperty is split between Year-Month
  mapDateRangeData: function (data, records, amountProperty, yearFrom) {
    for (const rec of records) {
      const dateFrom = rec.dateFrom.split('-');
      let y = Number.parseInt(dateFrom[0]),
          m = Number.parseInt(dateFrom[1]),
          d = Number.parseInt(dateFrom[2]) - 1, // -1 so it includes the first day
          daysTotal = numberOfDaysBetween(rec);

      const ppd = rec[amountProperty] / daysTotal;

      while (daysTotal > 0) {
        const month = data[y - yearFrom].months[m - 1],
              days = daysTotal < month.days ? daysTotal : month.days - d;

        let type = month.types.find(x => x.id === rec.costTypeId);
        if (!type) {
          type = { id: rec.costTypeId, sum: 0 };
          month.types.push(type);
        }

        type.sum += ppd * days;
        if (d !== 0) d = 0;
        m++;
        if (m > 12) {
          m = 1;
          y++;
        }

        daysTotal -= days;
      }
    }
  },

  // renders Year-Month-Type hierarchical structure to div as SVG for selected types
  renderYearMonthTypeData: function (divId, data, groupBy, sumSuffix, amountPerPx, types) {
    const svgA = [],
          svgB = [],
          rowHeight = 20,
          halfRow = 10,
          yearHeight = (12 / groupBy) * (rowHeight + 2),
          svgHeight = yearHeight * data.length;
    let svgWidth = 0,
        rowY = 0;

    for (let yi = data.length - 1; yi > -1; yi--) {
      const year = data[yi];

      for (let mi = 11; mi > -1; mi--) {
        const month = year.months[mi];

        // Sum by Type
        for (const type of month.types) {
          if (type.sum === 0) continue;
          const t = types.find(x => x.id === type.id);
          if (t) t.sum += type.sum;
        }

        // Render
        if (mi % groupBy === 0) {
          let typeX = 0,
              rowSum = 0;

          // Part/Month name
          if (groupBy === 12) {
            svgA.push(`<rect x="2" y="${rowY}" width="42" height="20" />`);
            svgA.push(`<text x="${rowHeight + 3}" y="${rowY + halfRow}">${year.name}</text>`);
          } else {
            svgA.push(`<rect x="24" y="${rowY}" width="20" height="20" />`);
            svgA.push(`<text x="${halfRow + 24}" y="${rowY + halfRow}">${((month.name - 1) / groupBy) + 1}</text>`);
          }

          // Types
          for (const type of types) {
            const width = amountPerPx === 0 ? type.sum.round(0) : (type.sum / amountPerPx).round(0);
            rowSum += type.sum;

            if (width > 0) {
              svgB.push(`<rect x="${typeX}" y="${rowY}" width="${width}" height="20" fill="${type.bgColor}" />`);
              typeX += width;
              type.sum = 0;
            }
          }

          // Sum
          svgA.push(`<rect x="46" y="${rowY}" width="42" height="20" />`);
          svgA.push(`<text x="67" y="${rowY + halfRow}" class="partSum">${rowSum.round(0)}${sumSuffix}</text>`);

          rowY += rowHeight + 2;

          if (typeX > svgWidth)
            svgWidth = typeX;
        }
      }

      // Year name
      if (groupBy !== 12) {
        const yearNameTop = rowY - yearHeight + ((yearHeight - 2) / 2);
        svgA.push(`<rect x="2" y="${rowY - yearHeight}" height="${yearHeight - 2}" width="20" />`);
        svgA.push(`<text x="12" y="${yearNameTop}" transform="rotate(270,12,${yearNameTop})" class="yearName">${year.name}</text>`);
      }
    }

    document.getElementById(divId).innerHTML =
      `<div class="infoColumn"><svg width="90" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">${svgA.join('')}</svg></div>
       <div class="dataColumn"><svg width="${svgWidth + 2}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">${svgB.join('')}</svg></div>`;

    app.UI.cursor.onChanged();
  }
};

// CAR Drives km/Days/Places
reports.carDrives = {
  id: '__rep_Drives',
  data: null,

  run: async function () {
    reports.setUpReport(this, 'Drives km/Days/Places');
    await reports.carDrives.getDataFromDb();
    reports.carDrives.renderData();
  },

  getDataFromDb: async function () {
    const drives = Array.from(await appStores.CAR_Drives.data()).orderBy('date', false);
    let lastDate = new Date().addDays(1).toYMD();
    this.data = [];

    for (const drv of drives) {
      this.data.push({
        date: drv.date,
        name: drv.desc,
        km: drv.km,
        days: numberOfDaysBetween({ dateFrom: drv.date, dateTo: lastDate }) - 1
      });
      lastDate = drv.date;
    }
  },

  renderData: function () {
    // get max km
    let maxKm = 0;
    for (const drv of this.data)
      if (maxKm < drv.km) maxKm = drv.km;

    //Init Canvas
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d'),
      dpr = window.devicePixelRatio;
    let width = 800,
      height = 10000,
      lastBottom = 0;

    width = Math.ceil(width * dpr);
    height = Math.ceil(height * dpr);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width / dpr}px`;
    canvas.style.height = `${height / dpr}px`;
    ctx.scale(dpr, dpr);

    //Draw Drives
    const pxPerDay = 2,
      pxPerKm = 0.5,
      center = maxKm * pxPerKm;
    for (const drv of this.data) {
      // name
      //app.canvas.drawText(ctx, drv.name, center - Math.ceil(ctx.measureText(drv.name).width / 2), lastBottom + 13, 'rgba(255, 255, 255, 1)');
      //lastBottom += 20;
      // km
      app.canvas.drawRect(ctx, center - (drv.km * pxPerKm), lastBottom, drv.km * pxPerKm, 20, 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1)');
      // km text
      //app.canvas.drawRect(ctx, drvsLeftOffset, textTop, ctx.measureText(drv.desc).width + 4, drvTextBoxHeight, 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1)');
      app.canvas.drawText(ctx, drv.km, center - (drv.km * pxPerKm) - ctx.measureText(drv.km).width - 4, lastBottom + 13, 'rgba(255, 255, 255, 1)');
      // days
      app.canvas.drawRect(ctx, center + 10, lastBottom, drv.days * pxPerDay, 20, 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1)');
      // days text
      app.canvas.drawRect(ctx, center + (drv.days * pxPerDay) + 14, lastBottom + 2, ctx.measureText(drv.days).width + 5, 14, 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1)');
      app.canvas.drawText(ctx, drv.days + '   ' + drv.name, center + (drv.days * pxPerDay) + 4 + 12, lastBottom + 13, 'rgba(255, 255, 255, 1)');
      lastBottom += 20;
    }

    document.getElementById(this.id).appendChild(canvas);
  }
};

// CAR Drives km/EUR
// TODO get costsTypes
reports.carDrives2 = {
  id: '__rep_Drives2',
  fileName: 'reportCarDrives2',
  data: null,
  transportCostTypeId: 0,
  costsTypes: [{ id: 0, name: 'Transport', bgColor: '#1F4280', sum: 0 },
               { id: 5, name: 'Insurance', bgColor: '#ED1C29', sum: 0 },
               { id: 6, name: 'MOT', bgColor: '#905501', sum: 0 }],
  groupBy: 1,
  lastInfoIndexes: null,

  run: async function(demo = false) {
    await reports.initReport(this, demo);
    this.groupBy = xSelect('__rep_groupBy').get()[0];
    reports.renderYearMonthTypeData(this.id, this.data, this.groupBy, '', 10, this.costsTypes.filter(x => x.id === 0));
  },

  init: function () {
    app.UI.setTitle('Drives km/€');

    const selectGroupBy = xSelect('__rep_groupBy');
    selectGroupBy.create([
      {value:1, name:'1 Month'},
      {value:3, name:'3 Months'},
      {value:6, name:'6 Months'},
      {value:12, name:'1 Year'}], false);
    selectGroupBy.set([1]);
    selectGroupBy.element.dataset.onchange = 'reports.carDrives2.run';
    app.UI.toolBar.clear();
    app.UI.toolBar.appendHtml(`<div class="toolBarIcon" onclick="reports.saveAsJson('${this.fileName}');">▼</div>`);
    app.UI.toolBar.appendElement(selectGroupBy.element);

    const divContainer = document.getElementById('report'),
          divRep = document.createElement('div');

    divContainer.innerHTML = '';
    divRep.id = this.id;
    divContainer.appendChild(divRep);

    app.UI.contentTabs.active('report');
    app.UI.cursor.changed = (offset) => {
      const html = this.getInfoData(offset);
      if (html !== null)
        app.UI.footer.setContent(html);
    }
    
    app.UI.footer.show();
    app.UI.cursor.show(divRep.offsetTop);
  },

  getInfoData: function (offset) {
    const self = reports.carDrives2,
          [yi, miFrom, miTo] = reports.getYearMonthIndex(offset, 22, self.groupBy),
          indexesHash = `${yi}-${miFrom}-${miTo}`,
          year = self.data[self.data.length - 1 - yi];

    if (self.lastInfoIndexes === indexesHash)
      return null;

    self.lastInfoIndexes = indexesHash;

    if (yi > self.data.length || !year)
      return '';

    const drives = [];
    let sumPricePerDay = 0;
    let sumDrivesEur = 0;
    for (let m = miFrom; m < miTo + 1; m++) {
      const month = year.months[m];

      for (const type of month.types) {
        if (type.id === self.transportCostTypeId) {
          for (const drive of type.data) {
            sumDrivesEur += drive.eur;
            drives.push(`<li>
              <span>${drive.date.split('-').join('.')}</span>
              <span>${drive.desc}</span>
              <span>${drive.km} km</span>
              <span>${drive.eur}€</span></li>`);
          }
        } else
          sumPricePerDay += type.sum;
      }
    }

    const drivesList = drives.length > 0 ? `<ul>${drives.join('')}</ul>` : '';
    return `<div id="${self.id}_info" class="repFooterInfo">
              <div>
                <span>Insurance and MOT</span>
                <span>${sumPricePerDay.round(0)}€</span>
                <span>Total</span>
                <span>${(sumPricePerDay + sumDrivesEur).round(0)}€</span>
              </div>
              ${drivesList}
            </div>`;
  },

  getDataFromDb: async function () {
    const drives = (await appStores.CAR_Drives.data())
            .map(x => ({ date: x.date, eur: x.eur, km: x.km, desc: x.desc, costTypeId: this.transportCostTypeId })).orderBy('date'),
          pricePerDay = Array.from(await appStores.CAR_PricePerDay.data()),
          minMaxDate = reports.getMinMaxDatesFromRange(pricePerDay),
          yearFrom = Number.parseInt(minMaxDate[0].substring(0, 4)),
          yearTo = Number.parseInt(minMaxDate[1].substring(0, 4));

    this.data = reports.getYearMonthDataStructure(yearFrom, yearTo);
    reports.mapDateRangeData(this.data, pricePerDay, 'eurTotal', yearFrom);
    reports.mapDateData(this.data, drives, 'km', yearFrom);
  }
};

// CAR_Refueling Refueling Consumption
reports.carRefueling = {
  id: '__rep_Refueling',

  run: function () {
    reports.setUpReport(this, 'Refueling Consumption');
    reports.carRefueling.renderData();
  },

  renderData: async function() {
    const pxPerL = 40,
          pxPerKm = 0.05,
          leftOffset = -80,
          topOffset = 20;

    let refs = Array.from(await appStores.CAR_Refueling.data()).orderBy('kmTotal'),
        arrCoords = [],
        startKm = refs[0].kmTotal;

    for (let ref of refs) {
      if (ref.consumption === 0) continue;
      arrCoords.push({
        date: ref.date,
        kmTotal: ref.kmTotal,
        consumption: ref.consumption,
        x: Math.ceil(leftOffset + (pxPerL * ref.consumption)),
        y: Math.ceil(topOffset + ((ref.kmTotal - startKm) * pxPerKm))
      });
    }

    //Init Canvas
    let canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d'),
        dpr = window.devicePixelRatio,
        width = 400,
        height = Math.ceil((arrCoords[arrCoords.length - 1].kmTotal - startKm) * pxPerKm) + 2 * topOffset;

    width = Math.ceil(width * dpr);
    height = Math.ceil(height * dpr);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width / dpr}px`;
    canvas.style.height = `${height / dpr}px`;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.font = '12px sans-serif';

    // Draw Graph
    ctx.beginPath();
    ctx.moveTo(leftOffset, topOffset);
    for (const rec of arrCoords)
      ctx.lineTo(rec.x, rec.y);
    ctx.lineTo(leftOffset, arrCoords[arrCoords.length - 1].y);
    ctx.fill();
    ctx.stroke();

    // Draw Consumptions texts
    let lastBottom = 0;
    for (const rec of arrCoords) {
      let textTop = rec.y - 8;
      if (textTop < lastBottom)
        textTop = lastBottom;
      lastBottom = textTop + 16;

      ctx.beginPath();
      ctx.moveTo(rec.x, rec.y);
      ctx.lineTo(rec.x + 20, textTop + 8);
      ctx.stroke();
      // consumption
      let consRectWidth = ctx.measureText(rec.consumption).width + 4;
      app.canvas.drawRect(ctx, rec.x + 20, textTop, consRectWidth, 16, 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1)');
      app.canvas.drawText(ctx, rec.consumption, rec.x + 22, textTop + 12, 'rgba(255, 255, 255, 1)');
      // date
      //app.canvas.drawRect(ctx, rec.x + consRectWidth + 24, textTop, ctx.measureText(rec.date.substring(0, 7)).width + 4, 16, 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1)');
      //app.canvas.drawText(ctx, rec.date.substring(0, 7), rec.x + consRectWidth + 26, textTop + 12, 'rgba(255, 255, 255, 1)');
    }

    // Draw km
    const kmFrom = Math.ceil(arrCoords[0].kmTotal / 1000) - 1,
          kmTo = Math.ceil(arrCoords[arrCoords.length - 1].kmTotal / 1000);

    ctx.font = '16px sans-serif';
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
    
    for (let km = kmFrom; km < kmTo; km++) {
      const y = (((km * 1000) - startKm) * pxPerKm) + topOffset;
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(130, y);
      ctx.stroke();
      app.canvas.drawText(ctx, km * 1000, 20, y - 2, 'rgba(255, 255, 255, 1)');
    }

    document.getElementById(this.id).appendChild(canvas);
  }
};

reports.monCosts = {
  id: '__rep_Costs',
  fileName: 'reportMonCosts',
  data: {
    costsTypes: [],
    data: []
  },
  costsTypes: null,
  selectedTypes: null,
  groupBy: 1,
  lastInfoIndexes: null,

  run: async function(demo = false) {
    await reports.initReport(this, demo);
    this.selectedTypes = xSelect('__rep_costsTypes').get();
    if (this.selectedTypes.length === 0) return;
    this.groupBy = xSelect('__rep_groupBy').get()[0];
    reports.renderYearMonthTypeData(`${this.id}_data`, this.data.data, this.groupBy, '€', 0, this.data.costsTypes.filter(x => this.selectedTypes.includes(x.id)));
  },

  init: function () {
    app.UI.setTitle('Costs');

    const types = [],
          typesIds = [],
          selectTypes = xSelect('__rep_costsTypes'),
          selectGroupBy = xSelect('__rep_groupBy');

    // Group by Select
    selectGroupBy.create([
      { value: 1, name: '1 Month' },
      { value: 3, name: '3 Months' },
      { value: 6, name: '6 Months' },
      { value: 12, name: '1 Year' }], false);
    selectGroupBy.set([1]);
    selectGroupBy.element.dataset.onchange = 'reports.monCosts.run';
    app.UI.toolBar.clear();
    app.UI.toolBar.appendHtml(`<div class="toolBarIcon" onclick="reports.saveAsJson('${this.fileName}');">▼</div>`);
    app.UI.toolBar.appendElement(selectGroupBy.element);

    // Costs Types Select
    for (const x of this.data.costsTypes) {
      types.push({ value: x.id, name: x.name, bgColor: x.bgColor });
      typesIds.push(x.id);
    }
    selectTypes.create(types, true, true);
    selectTypes.set(typesIds);
    selectTypes.element.dataset.onchange = 'reports.monCosts.run';

    const divContainer = document.getElementById('report'),
          divRep = document.createElement('div'),
          divRepData = document.createElement('div');

    divContainer.innerHTML = '';
    divRep.id = this.id;
    divRepData.id = `${this.id}_data`;
    divRep.appendChild(selectTypes.element);
    divRep.appendChild(divRepData);
    divContainer.appendChild(divRep);

    app.UI.contentTabs.active('report');
    app.UI.cursor.changed = (offset) => {
      const html = this.getInfoData(offset);
      if (html !== null)
        app.UI.footer.setContent(html);
    }
    app.UI.footer.show();
    app.UI.cursor.show(divRepData.offsetTop);
  },

  getInfoData: function(offset) {
    const self = reports.monCosts,
          [yi, miFrom, miTo] = reports.getYearMonthIndex(offset, 22, self.groupBy),
          indexesHash = `${yi}-${miFrom}-${miTo}`,
          year = self.data.data[self.data.data.length - 1 - yi];

    if (self.lastInfoIndexes === indexesHash)
      return null;

    self.lastInfoIndexes = indexesHash;

    if (yi > self.data.data.length)
      return '';

    // group by types
    const costsTypes = self.data.costsTypes.filter(x => self.selectedTypes.includes(x.id)).map(x => ({ ...x, data: []}));
    for (let m = miFrom; m < miTo + 1; m++) {
      const month = year.months[m];
      for (const type of month.types) {
        const typeSum = costsTypes.find(x => x.id === type.id);
        if (!typeSum) continue;
        for (const item of type.data) {
          typeSum.sum += item.eur;
          typeSum.data.push(item);
        }
      }
    }

    // render
    const types = [];
    for (const type of costsTypes) {
      if (type.sum === 0) continue;

      const items = [];
      for (const item of type.data.orderBy('date')) {
        const desc = item.desc ? `<span>${item.desc}</span>` : '';
        items.push(`
          <li class="greyBox spanRow">
            <span>${item.date.split('-').join('.')}</span>
            <span class="eurText">${item.eur.round(2)}€</span>
            ${desc}
          </li>`);
      }

      types.push(`
        <li style="background-color: ${type.bgColor}">
          <div class="typeHeader">
            <span>${type.name}</span>
            <span class="eurText greyBox">${type.sum.round(2)}€</span>
          </div>
          <ul>${items.join('')}</ul>
        </li>`);
    }

    return `<div id="__rep_Costs_info" class="repFooterInfo"><ul>${types.join('')}</ul></div>`;
  },

  getDataFromDb: async function() {
    const costs = (await appStores.MON_Costs.data())
            .map(x => ({ date: x.date, eur: x.eur, desc: x.desc, costTypeId: x.costTypeId })).orderBy('date', false),
          person = (await appStores.GLO_People.data()).find(x => x.active === true),
          transportData = await this.getTransportData(person ? person.id : 0),
          minMaxDate = reports.getMinMaxDatesFromRange((await appStores.CAR_PricePerDay.data())
            .concat([{ dateTo: costs[0].date, dateFrom: costs[costs.length - 1].date }])),
          yearFrom = Number.parseInt(minMaxDate[0].substring(0, 4)),
          yearTo = Number.parseInt(minMaxDate[1].substring(0, 4));

    this.data.costsTypes = (await appStores.MON_CostsTypes.data()).map(x => ({ ...x, sum: 0 })).orderBy('name');
    this.data.data = reports.getYearMonthDataStructure(yearFrom, yearTo);
    reports.mapDateData(this.data.data, costs, 'eur', yearFrom);
    reports.mapDateData(this.data.data, transportData, 'eur', yearFrom);
  },

  getTransportData: async (personId) => {
    const presencePerDay = Array.from(await appStores.CAR_PresencePerDay.data()),
          pricePerDay = Array.from(await appStores.CAR_PricePerDay.data()),
          minMaxDate = reports.getMinMaxDatesFromRange(pricePerDay),
          yearFrom = Number.parseInt(minMaxDate[0].substring(0, 4)),
          yearTo = Number.parseInt(minMaxDate[1].substring(0, 4)),
          monthIntervals = getMonthIntervals(yearFrom, yearTo),
          intervals = combineDateIntervals([monthIntervals, presencePerDay, pricePerDay], minMaxDate[1]),
          output = [];

    presencePerDay.forEach(x => { if (!x.dateTo) x.dateTo = minMaxDate[1]; });
    mapDataToIntervals(presencePerDay, 'people', intervals);
    mapDataToIntervals(pricePerDay, 'prices', intervals);
    splitPriceInIntervals(intervals);

    for (const i of intervals) {
      if (!i.people || !i.people.find(x => x.personId === personId)) continue;
      output.push({
        date: i.dateFrom,
        costTypeId: hardCoded.monTransportCostTypeId,
        eur: i.eurTotal / i.people.length,
        desc: 'Insurance and MOT'
      });
    }

    const drives = await appStores.CAR_Drives.data();
    for (const d of drives) {
      if (!d.people.find(x => x === personId)) continue;
      output.push({
        date: d.date,
        costTypeId: hardCoded.monTransportCostTypeId,
        eur: d.eur / d.people.length,
        desc: `${d.desc} ${d.km}km`
      });
    }

    return output;
  }
};

reports.gloCountriesStay = {
  id: '__rep_gloCountriesStay',
  fileName: 'reportGloCountriesStay',
  data: {
    countriesStay: [],
    drives: []
  },
  maxDate: null,
  pxPerDayCountries: 4,
  pxPerDayDrives: 10,
  divCountries: null,
  divDrives: null,
  divCursorDate: null,
  scrollTopUpdating: false,

  run: async function(demo = false) {
    await reports.initReport(this, demo);
    this.render();
    this.onScroll();
  },

  init: function() {
    this.divCountries = document.createElement('div');
    this.divCountries.id = `${this.id}_Countries`;
    this.divCountries.addEventListener('scroll', this.onScroll);

    this.divDrives = document.createElement('div');
    this.divDrives.id = `${this.id}_Drives`;
    this.divDrives.addEventListener('scroll', this.onScroll);

    this.divCursorDate = document.createElement('div');
    this.divCursorDate.className = 'cursorDate';

    const divContainer = document.createElement('div');
    divContainer.id = this.id;
    divContainer.appendChild(this.divCursorDate);
    divContainer.appendChild(this.divCountries);
    divContainer.appendChild(this.divDrives);

    document.getElementById('report').innerHTML = '';
    document.getElementById('report').appendChild(divContainer);

    app.UI.setTitle('Countries stay');
    app.UI.contentTabs.active('report');
    app.UI.toolBar.clear();
    app.UI.toolBar.appendHtml(`<div class="toolBarIcon" onclick="reports.saveAsJson('${this.fileName}');">▼</div>`);
    app.UI.footer.show();
    app.UI.cursor.show(divContainer.offsetTop);
    app.UI.cursor.changed = (offset) => {
      this.onScroll(null);
      this.divCursorDate.style.top = offset + divContainer.offsetTop + 'px';
    };
  },

  getDataFromDb: async function() {
    const countries = await appStores.GLO_Countries.data();
    this.data.countriesStay = (await appStores.GLO_CountriesStay.data({ sorted: true })).map(x => {
      const country = countries.find(c => c.id === x.countryId),
        o = {
          dateFrom: x.dateFrom,
          dateTo: x.dateTo ? x.dateTo : new Date(Date.now()).toYMD(),
          name: country.name,
          code: country.code
        };

      o.days = x.days ? x.days : numberOfDaysBetween(o);

      return o;
    });

    let lastDate = new Date().addDays(1).toYMD();
    this.data.drives = (await appStores.CAR_Drives.data()).orderBy('date', false).map(x => {
      const o = {
        dateFrom: x.date,
        dateTo: lastDate,
        name: x.desc,
        km: x.km
      };

      o.days = numberOfDaysBetween(o) - 1;
      lastDate = x.date;

      return o;
    });
  },

  onScroll: function(e) {
    const self = reports.gloCountriesStay;
    if (self.scrollTopUpdating) {
      self.scrollTopUpdating = false;
      return;
    }

    const cursorOffset = app.UI.cursor.getOffset(),
      scrollOnCountries = !e || e.target.id === `${self.id}_Countries`,
      days = scrollOnCountries
        ? (cursorOffset + self.divCountries.scrollTop) / self.pxPerDayCountries
        : (cursorOffset + self.divDrives.scrollTop) / self.pxPerDayDrives,
      div = scrollOnCountries ? self.divDrives : self.divCountries,
      targetPxPerDay = scrollOnCountries ? self.pxPerDayDrives : self.pxPerDayCountries,
      targetScrollTop = Math.round((days * targetPxPerDay) - cursorOffset);

    if (Math.round(div.scrollTop) !== targetScrollTop) {
      if (e) { // scrolling on divCountries or divDrives
        self.scrollTopUpdating = true;
        div.scrollTop = targetScrollTop;
      } else { // dragging cursor
        div.removeEventListener('scroll', self.onScroll);
        div.scrollTop = targetScrollTop;
        div.addEventListener('scroll', self.onScroll);
      }

      self.divCursorDate.innerHTML = new Date(self.maxDate).addDays(days * -1).toYMD('.');
      self.setInfoBox(days);
    }
  },

  setInfoBox: function (days) {
    const getRec = (data, d) => {
      for (const x of data) {
        d -= x.days;
        if (d < 0)
          return x;
      }
      return null;
    };

    const df = (date) => date.split('-').join('.');

    const ul = [],
      drive = getRec(this.data.drives, Number(days)),
      country = getRec(this.data.countriesStay, Number(days)),
      countryCode = country ? country.code : '';

    if (country) {
      ul.push(`<li>${df(country.dateFrom)} - ${df(country.dateTo)} - <span>${country.days} days</span></li>`);
      ul.push(`<li>${country.name}</li>`);
    }

    if (drive) {
      ul.push(`<li>${df(drive.dateFrom)} - ${df(drive.dateTo)} - <span>${drive.days} days</span></li>`);
      ul.push(`<li>${drive.name} <span>${drive.km} km</span></li>`);
    }

    app.UI.footer.setContent(`
      <div id="__rep_gloCountriesStay_info">
        <div><img src="img/flags/${countryCode}.png" /></div>
        <ul>${ul.join('')}</ul>
      </div>`);
  },

  render: function () {
    const svgA = [],
          svgB = [];
    let top = 0,
        nameTop = 0,
        daysTotal = 0;

    if (this.data.countriesStay.length !== 0)
      this.maxDate = this.data.countriesStay[0].dateTo;

    // Countries Stay
    for (const stay of this.data.countriesStay) {
      const height = stay.days * this.pxPerDayCountries,
            halfTop = top + (height / 2);

      nameTop = halfTop - nameTop < 25 ? nameTop + 25 : halfTop;

      svgA.push(`<text x="85" y="${nameTop}" class="stayDays">${stay.days}</text>`);
      svgA.push(`<line x1="30" y1="${halfTop}" x2="52" y2="${nameTop}" />`);
      svgA.push(`<image x="50" y="${nameTop - 10}" height="21" href="img/flags/${stay.code}.png" />`);
      svgA.push(`<rect x="10" y="${top}" width="20" height="${height}" />`);

      top += height;
      daysTotal += stay.days;
    }

    this.divCountries.innerHTML += `<svg width="120" height="${top}" xmlns="http://www.w3.org/2000/svg">${svgA.join('')}</svg>`;

    // Drives
    top = 0;
    nameTop = 0;
    for (const drive of this.data.drives) {
      const height = drive.days * this.pxPerDayDrives,
            halfTop = top + (height / 2);

      nameTop = halfTop - nameTop < 15 ? nameTop + 15 : halfTop;

      svgB.push(`<line x1="20" y1="${halfTop}" x2="38" y2="${nameTop}" />`);
      svgB.push(`<text x="40" y="${nameTop}" class="driveName">${drive.name} <tspan>${drive.days}</tspan></text>`);
      svgB.push(`<rect x="0" y="${top}" width="20" height="${height}" />`);

      top += height;
    }

    this.divDrives.innerHTML += `<svg width="250" height="${daysTotal * this.pxPerDayDrives}" xmlns="http://www.w3.org/2000/svg">${svgB.join('')}</svg>`;
  }
};

reports.gloCountriesStaySum = {
  id: '__rep_gloCountriesStaySum',
  fileName: 'reportGloCountriesStaySum',
  data: [],
  pxPerDay: 1,

  run: async function (demo = false) {
    await reports.initReport(this, demo);
    this.render();
  },

  init: function () {
    const divRep = document.getElementById('report');
    divRep.innerHTML = `<div id="${this.id}"></div>`;

    app.UI.setTitle('Countries stay sum');
    app.UI.contentTabs.active('report');
    app.UI.toolBar.clear();
    app.UI.toolBar.appendHtml(`<div class="toolBarIcon" onclick="reports.saveAsJson('${this.fileName}');">▼</div>`);
    app.UI.footer.hide();
    app.UI.cursor.hide();
  },

  getDataFromDb: async function () {
    const countriesStay = await appStores.GLO_CountriesStay.data();
    const countries = (await appStores.GLO_Countries.data()).map(country => {
      const days = countriesStay.filter(stay => stay.countryId === country.id).map(stay => {
        if (!stay.dateTo)
          stay.dateTo = new Date(Date.now()).toYMD();
        if (!stay.days)
          stay.days = numberOfDaysBetween(stay);

        return stay;
      }).reduce((acc, cur) => acc + cur.days, 0);

      return { name: country.name, days };
    });

    this.data = countries.orderBy('days', false);
  },

  render: function () {
    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
      const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

      return {
        x: (centerX + (radius * Math.cos(angleInRadians))).round(2),
        y: (centerY + (radius * Math.sin(angleInRadians))).round(2)
      };
    };

    const describeArc = (x, y, radius, startAngle, endAngle) => {
      const start = polarToCartesian(x, y, radius, endAngle),
            end = polarToCartesian(x, y, radius, startAngle),
            largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

      return [
        'M', x, y,
        'L', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        'Z'
      ].join(' ');
    };

    const svg = [],
          degPerDay = 360 / this.data.reduce((acc, cur) => acc + cur.days, 0),
          degPerColor = Math.round(360 / this.data.length),
          divRep = document.getElementById(this.id),
          halfWidth = divRep.clientWidth / 2;
    let lastAngle = 0,
        lastColor = 0,
        top = halfWidth * 2,
        daysSum = 0;

    for (const country of this.data) {
      const endAngle = lastAngle + (degPerDay * country.days),
            color = `hsl(${lastColor}, 50%, 40%)`;

      svg.push(`<rect x="20" y="${top}" height="20" width="30" fill="${color}" />`);
      svg.push(`<text x="55" y="${top + 11}">${country.name} <tspan>${daysToYMD(country.days, true)}</tspan></text>`);
      svg.push(`<path fill="${color}" d="${describeArc(halfWidth, halfWidth, halfWidth - 20, lastAngle, endAngle)}" />`);

      lastAngle = endAngle;
      lastColor += degPerColor;
      top += 22;
      daysSum += country.days;
    }

    svg.push(`<circle cx="${halfWidth}" cy="${halfWidth}" r="${halfWidth / 2}" fill="#33373A" />`);
    svg.push(`<text x="${halfWidth}" y="${halfWidth - 20}" class="daysSum">${daysSum}</text>`);
    svg.push(`<text x="${halfWidth}" y="${halfWidth + 30}" class="daysSumSpread">${daysToYMD(daysSum)}</text>`);

    divRep.innerHTML = `<svg width="${halfWidth * 2}" height="${top}" xmlns="http://www.w3.org/2000/svg">${svg.join('')}</svg>`;
  }
};

const daysToYMD = (days, short = false) => {
  const y = Math.floor(days / 365);
  days -= y * 365;
  const m = Math.floor(days / 30.4);
  days -= m * 30.4;
  const d = Math.round(days);

  if (short)
    return [`${y ? `${y}y ` : ''}`,
            `${m ? `${m}m ` : ''}`,
            `${d ? `${d}d` : ''}`].join('');

  return [`${y ? (`${y} year${y > 1 ? 's ' : ' '}`) : ''}`,
          `${m ? (`${m} month${m > 1 ? 's ' : ' '}`) : ''}`,
          `${d ? (`${d} day${d > 1 ? 's' : ''}`) : ''}`].join('');
};