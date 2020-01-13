var reports = {
  setUpReport: (rep, title) => {
    app.UI.toolBar.clear();
    app.UI.setTitle(title);
    app.UI.contentTabs.active('report');
    app.UI.cursor.hide();
    app.UI.footer.hide();
    document.getElementById('report').innerHTML = `<div id="${rep.id}"></div>`;
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

    app.UI.cursor.updateInfoBox();
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
  data: null,
  transportCostTypeId: 0,
  costsTypes: [{ id: 0, name: 'Transport', bgColor: '#1F4280', sum: 0 },
               { id: 5, name: 'Insurance', bgColor: '#ED1C29', sum: 0 },
               { id: 6, name: 'MOT', bgColor: '#905501', sum: 0 }],
  groupBy: 1,

  run: async function(demo = false) {
    if (!document.getElementById(this.id)) {
      if (demo) {
        if (!(await this.getDataFromJson())) {
          app.createAppMap();
          return;
        }
      } else
        await this.getDataFromDb();

      this.init();
    }

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
    app.UI.toolBar.appendHtml('<div class="toolBarIcon" onclick="reports.carDrives2.save();">▼</div>');
    app.UI.toolBar.appendElement(selectGroupBy.element);

    const divContainer = document.getElementById('report'),
          divRep = document.createElement('div');

    divContainer.innerHTML = '';
    divRep.id = this.id;
    divContainer.appendChild(divRep);

    app.UI.contentTabs.active('report');
    app.UI.cursor.getInfoData = this.getInfoData;
    
    app.UI.footer.show();
    app.UI.cursor.show(divRep.offsetTop);
  },

  getInfoData: function (offset) {
    const self = reports.carDrives2,
          [yi, miFrom, miTo] = reports.getYearMonthIndex(offset, 22, self.groupBy),
          year = self.data[self.data.length - 1 - yi];

    if (yi > self.data.length || !year)
      return null;

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

  save: function () {
    app.downloadDataAsJson({ date: new Date().toYMD(), data: this.data }, 'reportCarDrives2.json');
  },

  getDataFromJson: async function () {
    const response = await fetch('/TravelCosts/reportCarDrives2.json');

    if (!response.ok) {
      app.log('Network response was not ok when getting demo data.', true);
      return false;
    }

    const json = await response.json();
    document.getElementById('version').innerHTML = json.date;
    this.data = json.data;

    return true;
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
  data: null,
  costsTypes: null,
  selectedTypes: null,
  groupBy: 1,

  run: async function(demo = false) {
    if (!document.getElementById(reports.monCosts.id)) {
      if (demo) {
        if (!(await this.getDataFromJson())) {
          app.createAppMap();
          return;
        }
      }
      else {
        this.costsTypes = (await appStores.MON_CostsTypes.data()).map(x => ({ ...x, sum: 0 })).orderBy('name');
        await reports.monCosts.getDataFromDb();
      }
      reports.monCosts.init();
    }

    this.selectedTypes = xSelect('__rep_costsTypes').get();
    if (this.selectedTypes.length === 0) return;
    this.groupBy = xSelect('__rep_groupBy').get()[0];
    reports.renderYearMonthTypeData(`${this.id}_data`, this.data, this.groupBy, '€', 0, this.costsTypes.filter(x => this.selectedTypes.includes(x.id)));
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
    app.UI.toolBar.appendHtml('<div class="toolBarIcon" onclick="reports.monCosts.save();">▼</div>');
    app.UI.toolBar.appendElement(selectGroupBy.element);

    // Costs Types Select
    for (const x of this.costsTypes) {
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
    app.UI.cursor.getInfoData = this.getInfoData;
    app.UI.footer.show();
    app.UI.cursor.show(divRepData.offsetTop);
  },

  getInfoData: function(offset) {
    const self = reports.monCosts,
          [yi, miFrom, miTo] = reports.getYearMonthIndex(offset, 22, self.groupBy),
          year = self.data[self.data.length - 1 - yi];

    if (yi > self.data.length)
      return null;

    // group by types
    const costsTypes = self.costsTypes.filter(x => self.selectedTypes.includes(x.id)).map(x => ({ ...x, data: []}));
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
      for (const item of type.data.orderBy('date', false)) {
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

  save: function () {
    app.downloadDataAsJson({ date: new Date().toYMD(), costsTypes: this.costsTypes, data: this.data }, 'reportMonCosts.json');
  },

  getDataFromJson: async function () {
    const response = await fetch('/TravelCosts/reportMonCosts.json');

    if (!response.ok) {
      app.log('Network response was not ok when getting demo data.', true);
      return false;
    }

    const json = await response.json();
    document.getElementById('version').innerHTML = json.date;
    this.costsTypes = json.costsTypes;
    this.data = json.data;

    return true;
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

    this.data = reports.getYearMonthDataStructure(yearFrom, yearTo);
    reports.mapDateData(this.data, costs, 'eur', yearFrom);
    reports.mapDateData(this.data, transportData, 'eur', yearFrom);
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
