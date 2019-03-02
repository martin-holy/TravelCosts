const monEURCurrencyId = 9;
const carDieselCostTypeId = 3;
const carAmortizationCostTypeId = 4;

// gets actual rate for a day or last actual rate if not found
amountInEUR = async (rec, roundTo = 2) => {
  if (rec.currencyId == monEURCurrencyId) //EUR
    return rec.amount;

  let rates = await aaf.getStoreRecords('MON_Rates'),
      rate = rates.find(r => r.date == rec.date && r.currencyId == rec.currencyId);
  
  if (rate === undefined) {
    let currencies = await aaf.getStoreRecords('MON_Currencies');
    rate = currencies.find(x => x.id == rec.currencyId);
  }

  return rate === undefined ? 0 : (rec.amount / rate.amount).round(roundTo);
};

// gets number of days between rec.dateFrom and rec.dateTo
numberOfDaysBetween = (rec) => {
  let a = new Date(rec.dateFrom).setHours(0, 0, 0, 0),
      b = new Date(rec.dateTo == null ? Date.now() : rec.dateTo).setHours(0, 0, 0, 0);
  return (b - a) / (1000 * 60 * 60 * 24) + 1;
};

// recalculate consumptions for all refuelings
carCalcConsumptions = () => {
  return new Promise(async (resolve) => {
    const storeName = 'CAR_Refueling';
    let refuelings = Array.from(await aaf.getStoreRecords(storeName)).orderBy('kmTotal'),
        tx = aaf.db.transaction([storeName], 'readwrite'),
        store = tx.objectStore(storeName),
        kmFrom = 0,
        l = 0;

    tx.oncomplete = async () => {
      delete aaf.dbSchema.find(s => s.name == storeName).data;
      resolve(await carUpdateDieselPricePerKm());
    };

    for (let ref of refuelings) {
      if (kmFrom == 0) {
        kmFrom = ref.kmTotal;
        ref.consumption = 0;
        store.put(ref);
        continue;
      }
      
      l += ref.liters;

      if (ref.fullTank) {
        ref.consumption = ((100.0 / (ref.kmTotal - kmFrom)) * l).round(2);
        kmFrom = ref.kmTotal;
        l = 0;
      } else {
        ref.consumption = 0;
      }

      store.put(ref);
    }
  });
};

carGetEurPerKm = (rec) => {
  return (rec.eurTotal / (rec.kmTo - rec.kmFrom)).round(3);
};

carGetEurPerDay = (rec) => {
  return (rec.eurTotal / numberOfDaysBetween(rec)).round(3);
};

carUpdateDieselPricePerKm = () => {
  return new Promise(async (resolve) => {
    let refuelings = Array.from(await aaf.getStoreRecords('CAR_Refueling')).orderBy('kmTotal'),
    arrLiters = [],
    arrPrice = [],
    arrKm = [],
    litersFrom = 0,
    litersTotal = 0,
    lastLitersTotal = 0,
    kmFrom = 0;

    for (let ref of refuelings) {
      // | kmFrom | kmTo | consumption | litersFrom | litersTo |
      if (kmFrom != 0) litersTotal += ref.liters;
      if (ref.fullTank) {
        if (kmFrom != 0) {
          arrKm.push({
            kmFrom: kmFrom,
            kmTo: ref.kmTotal,
            consumption: ref.consumption,
            litersFrom: lastLitersTotal,
            litersTo: litersTotal
          });
          lastLitersTotal = litersTotal;
        }
        kmFrom = ref.kmTotal;
      }

      // | litersFrom | litersTo | eur per liter |
      arrLiters.push({
        litersFrom: litersFrom, 
        litersTo: litersFrom + ref.liters, 
        eur: await amountInEUR({
          date: ref.date, 
          currencyId: ref.currencyId, 
          amount: ref.pricePerLiter}, 3)});

      litersFrom += ref.liters;
    }

    arrKm = arrKm.orderBy('kmFrom');

    for (let km of arrKm) {
      for (let l of arrLiters) {
        if ((km.litersFrom >= l.litersFrom) && (km.litersTo <= l.litersTo)) {
          arrPrice.push({
            kmFrom: km.kmFrom,
            kmTo: km.kmTo,
            consumption: km.consumption,
            EURPerL: l.eur
          });
        }

        if ((km.litersFrom >= l.litersFrom) && (km.litersTo > l.litersTo) && (km.litersFrom < l.litersTo)) {
          arrPrice.push({
            kmFrom: km.kmFrom,
            kmTo: km.kmFrom + ((l.litersTo - km.litersFrom) * km.consumption),
            consumption: km.consumption,
            EURPerL: l.eur
          });
        }

        if ((km.litersFrom < l.litersFrom) && (km.litersTo <= l.litersTo) && (km.litersTo > l.litersFrom)) {
          arrPrice.push({
            kmFrom: km.kmFrom + ((l.litersFrom - km.litersFrom) * km.consumption),
            kmTo: km.kmTo,
            consumption: km.consumption,
            EURPerL: l.eur
          });
        }

        if ((km.litersFrom < l.litersFrom) && (km.litersTo > l.litersTo)) {
          arrPrice.push({
            kmFrom: km.kmFrom + ((l.litersFrom - km.litersFrom) * km.consumption),
            kmTo: km.kmFrom + ((l.litersFrom - km.litersFrom) * km.consumption) + ((l.litersTo - l.litersFrom) * km.consumption),
            consumption: km.consumption,
            EURPerL: l.eur
          });
        }
      }
    }

    //Last record for drivers after last full tank refueling
    arrPrice.push({
      kmFrom: arrPrice[arrPrice.length - 1].kmTo,
      kmTo: arrPrice[arrPrice.length - 1].kmTo + 1000,
      consumption: 7.3,
      EURPerL: arrPrice[arrPrice.length - 1].EURPerL
    });

    //Adding eurTotal, eurPerKm and found flag
    //Rounding km
    for (let price of arrPrice) {
      price.kmFrom = price.kmFrom.round(0);
      price.kmTo = price.kmTo.round(0);
      price.eurTotal = ((price.consumption / 100.0) * (price.kmTo - price.kmFrom) * price.EURPerL).round(3);
      price.eur = (price.eurTotal / (price.kmTo - price.kmFrom)).round(3);
      price.costTypeId = carDieselCostTypeId;
      price.found = false;
    }

    let arrPricePerKmDiesel = (await aaf.getStoreRecords('CAR_PricePerKm')).filter(p => p.costTypeId == carDieselCostTypeId),
        tx = aaf.db.transaction(['CAR_PricePerKm'], 'readwrite'),
        store = tx.objectStore('CAR_PricePerKm'),
        found = false;

    tx.oncomplete = () => {
      delete aaf.dbSchema.find(s => s.name == 'CAR_PricePerKm').data;
      resolve();
    };

    //Comparing data
    for (let ppk of arrPricePerKmDiesel) {
      found = false;
      for (let p of arrPrice) {
        if (ppk.kmFrom == p.kmFrom && ppk.kmTo == p.kmTo && ppk.eurTotal == p.eurTotal) {
          p.found = true;
          found = true;
          break;
        }
      }
      //Deleting old ones
      if (!found) store.delete(ppk.id);
    }

    //Inserting new ones
    for (let p of arrPrice) {
      if (!p.found) store.add(p);
    }
  });
};

carUpdateAmortizationPricePerKm = () => {
  return new Promise(async (resolve) => {
    let arrPricePerKmAmorti = (await aaf.getStoreRecords('CAR_PricePerKm')).filter(p => p.costTypeId == carAmortizationCostTypeId),
        lastKmTotal = Array.from(await aaf.getStoreRecords('CAR_Drives')).orderBy('kmTotal', false)[0],
        tx = aaf.db.transaction(['CAR_PricePerKm'], 'readwrite'),
        store = tx.objectStore('CAR_PricePerKm');

    tx.oncomplete = () => {
      delete aaf.dbSchema.find(s => s.name == 'CAR_PricePerKm').data;
      resolve();
    };

    //Extending Amortization
    lastKmTotal = lastKmTotal === undefined ? 300000 : lastKmTotal.kmTotal;
    for (let a of arrPricePerKmAmorti) {
      a.kmTo = lastKmTotal;
      a.eur = (a.eurTotal / (a.kmTo - a.kmFrom)).round(5);
      store.put(a);
    }
  });
}

carUpdatePricePerDrives = () => {
  return new Promise(async (resolve) => {
    await carUpdateAmortizationPricePerKm();

    let arrDrives = Array.from(await aaf.getStoreRecords('CAR_Drives')).orderBy('kmTotal'),
        arrPricePerKm = await aaf.getStoreRecords('CAR_PricePerKm'),
        tx = aaf.db.transaction(['CAR_Drives'], 'readwrite'),
        store = tx.objectStore('CAR_Drives'),
        kmFrom = 156327; // stav při koupení auta

    tx.oncomplete = async () => {
      delete aaf.dbSchema.find(s => s.name == 'CAR_Drives').data;
      resolve();
    };

    for (let drv of arrDrives) {
      let eur = 0;
      drv.km = drv.kmTotal - kmFrom;

      for (let price of arrPricePerKm) {
        if (price.kmTo <= kmFrom || price.kmFrom >= drv.kmTotal) continue;

        let from = price.kmFrom < kmFrom ? kmFrom : price.kmFrom,
            to = price.kmTo > drv.kmTotal ? drv.kmTotal : price.kmTo,
            pricePerKm = price.eurTotal / (price.kmTo - price.kmFrom);

        eur += (to - from) * pricePerKm;
      }

      drv.eur = eur.round(2);
      store.put(drv);

      kmFrom = drv.kmTotal;
    }

  });
};

carDrivesReport = async () => {
  //Init Canvas
  let canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d'),
      dpr = window.devicePixelRatio,
      width = 400,
      height = 10000;

  width = Math.ceil(width * dpr);
  height = Math.ceil(height * dpr);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width / dpr}px`;
  canvas.style.height = `${height / dpr}px`;
  ctx.scale(dpr, dpr);

  //Draw Drives
  const pxPerDay = 6,
        dateNow = new Date().toYMD(),
        drvsLeftOffset = 100
        drvTextBoxHeight = 16;
  let drives = Array.from(await aaf.getStoreRecords('CAR_Drives')).orderBy('kmTotal', false),
      lastDate = new Date().addDays(1).toYMD(),
      lastBottom = 0;
  
  ctx.font = '12px sans-serif';
  for (const drv of drives) {
    const daysFromNow = numberOfDaysBetween({ dateFrom: drv.date, dateTo: dateNow }),
          daysFromLast = numberOfDaysBetween({ dateFrom: lastDate, dateTo: dateNow });
    let drvHeight = (daysFromNow - daysFromLast) * pxPerDay,
        drvTop = daysFromLast * pxPerDay,
        textTop = drvTop + Math.ceil(drvHeight / 2) - drvTextBoxHeight / 2;
    lastDate = drv.date;
    aaf.canvas.drawRect(ctx, 50, drvTop, 20, drvHeight, 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1)');

    if (textTop < lastBottom) 
      textTop = lastBottom;
    lastBottom = textTop + drvTextBoxHeight;
    aaf.canvas.drawRect(ctx, drvsLeftOffset, textTop, ctx.measureText(drv.desc).width + 4, drvTextBoxHeight, 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1)');
    aaf.canvas.drawText(ctx, drv.desc, drvsLeftOffset + 2, textTop + 12, 'rgba(255, 255, 255, 1)');

    ctx.beginPath();
    ctx.moveTo(70, drvTop + Math.ceil(drvHeight / 2));
    ctx.lineTo(drvsLeftOffset, textTop + drvTextBoxHeight / 2);
    ctx.stroke();

  }


  let divRep = document.createElement('div'),
      divRepData = document.createElement('div');

  divRep.id = '__rep_DrivesReport';
  divRepData.id = '__rep_DrivesReportData';
  divRepData.appendChild(canvas);
  divRep.appendChild(divRepData);

  document.getElementById('treeView').innerHTML = '';
  document.getElementById('treeView').appendChild(divRep);
  aaf.contentTabs.active('treeView');
}

combineDateIntervals = (arrays) => {
  let from = new Set(),
      to = new Set();

  // getting dates from and dates to
  arrays.forEach(a => a.forEach(x => {
    let dateTo = x.dateTo == null ? new Date().toYMD() : x.dateTo;
    from.add(x.dateFrom);
    from.add(new Date(dateTo).addDays(1).toYMD());
    to.add(dateTo);
    to.add(new Date(x.dateFrom).addDays(-1).toYMD());
  }));

  let arrFrom = [...from].sort(),
      arrTo = [...to].sort(),
      intervals = [];

  // skipping first dateTo and last dateFrom
  for (let i = 1; i < arrTo.length; i++) {
    intervals.push({
      dateFrom: arrFrom[i-1], 
      dateTo: arrTo[i]});
  }

  return intervals;
};

mapDataToIntervals = (data, mapTo, intervals) => {
  for(let i of intervals) {
    for (let d of data) {
      let dataDateTo = d.dateTo == null ? new Date().toYMD() : d.dateTo;
      if (d.dateFrom > i.dateTo || dataDateTo < i.dateFrom) continue;
      if (!i[mapTo]) i[mapTo] = [];
      i[mapTo].push(d);
    }
  }
  return intervals;
};

splitPriceInIntervals = (intervals) => {
  // calculating total price for intervals
  for (let i of intervals) {
    let eur = 0;
    if (i.prices) {
      for (let price of i.prices) {
        let from = price.dateFrom < i.dateFrom ? i.dateFrom : price.dateFrom,
            to = price.dateTo > i.dateTo ? i.dateTo : price.dateTo,
            pricePerDay = price.eurTotal / numberOfDaysBetween(price);

        eur += numberOfDaysBetween({dateFrom: from, dateTo: to}) * pricePerDay;
      }
    }
    i.eurTotal = eur;
  }
};

monGetPricesByDay = async () => {
  let presencePerDay = Array.from(await aaf.getStoreRecords("CAR_PresencePerDay")),
      pricesPerDay = Array.from(await aaf.getStoreRecords("CAR_PricePerDay")),
      intervals = combineDateIntervals([presencePerDay]);

  mapDataToIntervals(presencePerDay, 'people', intervals);
  mapDataToIntervals(pricesPerDay, 'prices', intervals);
  splitPriceInIntervals(intervals);
  
  return intervals;
};

monDebtsCalc = async () => {
  let presencePerDay = Array.from(await aaf.getStoreRecords("CAR_PresencePerDay")),
      intervals = await monGetPricesByDay(),
      people = [];
      
  for (let p of presencePerDay) {
    people.push({id: p.personId, eur: 0});
  }

  for (let i of intervals) {
    let eurPerPerson = i.eurTotal / i.people.length;
    for (let p of i.people) {
      people.find(x => x.id == p.personId).eur += eurPerPerson;
    }
  }

  // CALCULATING PRICE FOR DIESEL, OIL, AMORTIZATION, TIRES => DRIVES
  let drives = await aaf.getStoreRecords("CAR_Drives");
  for (let drv of drives) {
    let eurPerPerson = drv.eur / drv.people.length;
    for (let pId of drv.people) {
      people.find(p => p.id == pId).eur += eurPerPerson;
    }
  }

  // CALCULATING DEBTS RECORDS
  let debts = await aaf.getStoreRecords("MON_Debts"),
      pairs = [];
  for (let d of debts) {
    let pair = pairs.find(p => p.payerId == d.payerId && p.debtorId == d.debtorId);
    if (pair === undefined) {
      pair = { payerId: d.payerId, debtorId: d.debtorId, eur: 0 };
      pairs.push(pair);
    }
    pair.eur += await amountInEUR(d);
  }

  // COMBINATING DEBTS RECORDS WITH DRIVES, MOT AND INSURANCE
  for (let pair of pairs) {
    let mp = pairs.find(p => p.payerId == pair.debtorId && p.debtorId == pair.payerId);
    pair.eurCalc = mp === undefined ? 0 : pair.eur - mp.eur;

    if (pair.debtorId == 3) { // carry
      pair.eurCalc -= people.find(p => p.id == pair.payerId).eur;
    }

    if (pair.payerId == 3) { // carry
      pair.eurCalc += people.find(p => p.id == pair.debtorId).eur;
    }
  }

  pairs.forEach(pair => {
    pair.eur = pair.eur.round(0);
    pair.eurCalc = pair.eurCalc.round(0);
  });

  for (let pair of pairs) {
    pair.eur = pair.eur.round(0);
    pair.eurCalc = pair.eurCalc.round(0);
  }

  pairs = pairs.filter(p => p.eurCalc > 0);

  // render result
  let form = { properties: [
    { name: "payerId", title: "Payer", source: { name: "GLO_People", property: "name" }},
    { name: "debtorId", title: "Debtor", source: { name: "GLO_People", property: "name" }},
    { name: "eurCalc", title: "EUR", align: "right" }]};
  await aaf.linkStores(form);
  document.getElementById('grid').innerHTML = await aaf.getGrid(form, pairs, false);
};

monGetTransportData = async (personId) => {
  let presencePerDay = Array.from(await aaf.getStoreRecords("CAR_PresencePerDay")).orderBy('dateFrom'),
      pricesPerDay = Array.from(await aaf.getStoreRecords("CAR_PricePerDay")),
      yearFrom = Number.parseInt(presencePerDay[0].dateFrom.substring(0, 4)),
      yearTo = new Date().getFullYear(),
      monthIntervals = [],
      intervals = [],
      output = [];

  for (y = yearFrom; y < yearTo + 1; y++) {
    for (let m = 0; m < 12; m++) {
      monthIntervals.push({ 
        dateFrom: new Date(y, m, 1).toYMD(), 
        dateTo: new Date(y, m + 1, 0).toYMD() });
    }
  }

  intervals = combineDateIntervals([monthIntervals, presencePerDay, pricesPerDay]);
  mapDataToIntervals(presencePerDay, 'people', intervals);
  mapDataToIntervals(pricesPerDay, 'prices', intervals);
  splitPriceInIntervals(intervals);

  for (let i of intervals) {
    if (!i.people || i.people.find(x => x.personId == personId) == undefined) continue;
    output.push({
      date: i.dateFrom,
      costTypeId: 3, // 3 = transport //TODO get it from settings
      eur: i.eurTotal / i.people.length
    });
  }

  let drives = await aaf.getStoreRecords('CAR_Drives');
  for (let d of drives) {
    if (d.people.find(x => x == personId) == undefined) continue;
    output.push({
      date: d.date,
      costTypeId: 3, // 3 = transport //TODO get it from settings
      eur: d.eur / d.people.length
    });
  }

  return output;
};

monCostsReport = async () => {
  let costTypes = Array.from(await aaf.getStoreRecords('MON_CostsTypes')).orderBy('name');

  if (document.getElementById('__rep_CostsReport') == null) {
    let people = Array.from(await aaf.getStoreRecords('GLO_People')).orderBy('name'),
        types = [],
        typesSet = [],
        selectTypes = xSelect('__rep_costTypeId'),
        selectPerson = xSelect('__rep_personId'),
        selectGroupBy = xSelect('__rep_groupBy'),
        divRep = document.createElement('div'),
        divRepData = document.createElement('div'),
        divSelects = document.createElement('div'),
        divTypes = document.createElement('div');

    for (let x of costTypes) {
      types.push({value: x.id, name: x.name, bgColor: x.bgColor});
      typesSet.push(x.id);
    }

    people.forEach(x => x.value = x.id);
    selectPerson.create(people, false, true);
    selectPerson.set([1]);
    selectPerson.element.dataset.onchange = 'monCostsReport';

    selectGroupBy.create([{value:1,name:'1 Month'},{value:3,name:'3 Months'},{value:6,name:'6 Months'},{value:12,name:'1 Year'}], false);
    selectGroupBy.set([1]);
    selectGroupBy.element.dataset.onchange = 'monCostsReport';

    selectTypes.create(types, true, true);
    selectTypes.set(typesSet);
    selectTypes.element.dataset.onchange = 'monCostsReport';

    divSelects.appendChild(selectPerson.element);
    divSelects.appendChild(selectGroupBy.element);
    divTypes.appendChild(selectTypes.element);
    divRep.appendChild(divSelects);
    divRep.appendChild(divTypes);
    divRep.appendChild(divRepData);
    divRep.id = '__rep_CostsReport';
    divRepData.id = '__rep_CostsReportData';

    document.getElementById('treeView').innerHTML = '';
    document.getElementById('treeView').appendChild(divRep);
  }

  let selectedCostTypes = xSelect('__rep_costTypeId').get();
  if (selectedCostTypes.length == 0) return;
  
  let groupBy = xSelect('__rep_groupBy').get()[0],
      records = await aaf.getStoreRecords('MON_Costs'),
      transportData = await monGetTransportData(xSelect('__rep_personId').get()[0]),  // 1 = Martin //TODO get it from settings
      allRecords = records.concat(transportData),
      years = [],
      years2 = [];
  
  // new version
  /*for (let r of records) {
    if (selectedCostTypes.find(x => x == r.costTypeId) === undefined) continue;

    let year = r.date.substring(0, 4),
        month = Number.parseInt(r.date.substring(5, 7)),
        part = Math.floor((month - 1) / groupBy) + 1,
        dataYear;

    dataYear = years2.find(x => x.year == year && x.part == part && x.costTypeId == r.costTypeId);
    if (dataYear === undefined) {
      let costType = costTypes.find(x => x.id == r.costTypeId);
      dataYear = { 
        year: year, 
        part: part, 
        costTypeId: r.costTypeId, 
        typeSum = 0, 
        typeName: costType.name, 
        bgColor: costType.bgColor };
      years2.push(dataYear);
    }
    dataYear.typeSum += r.eur;
  }*/
  // old version
  for (let r of allRecords) {
    if (selectedCostTypes.find(x => x == r.costTypeId) === undefined) continue;

    let year = r.date.substring(0, 4),
        month = Number.parseInt(r.date.substring(5, 7)),
        part = Math.floor((month - 1) / groupBy) + 1,
        dataYear,
        dataPart,
        dataPartType;
    
    dataYear = years.find(x => x.name == year);
    if (dataYear === undefined) {
      dataYear = { name: year, sum: 0, parts: [] };
      years.push(dataYear);
    }

    dataPart = dataYear.parts.find(x => x.name == part);
    if (dataPart === undefined) {
      let days = new Date(Number.parseInt(year), month, 0).getDate();
      dataPart = { name: part, sum: 0, types: [], days: days};
      dataYear.parts.push(dataPart);
    }

    dataPartType = dataPart.types.find(x => x.costTypeId == r.costTypeId);
    if (dataPartType === undefined) {
      let costType = costTypes.find(x => x.id == r.costTypeId);
      dataPartType = { costTypeId: r.costTypeId, sum: 0, name: costType.name, bgColor: costType.bgColor };
      dataPart.types.push(dataPartType);
    }

    dataYear.sum += r.eur;
    dataPart.sum += r.eur;
    dataPartType.sum += r.eur;
  }
  //end old version

  let trs = [],
      currentYear;
  years.orderBy('name', false);
  for (let year of years) {
    year.parts.orderBy('name', false);
    for (let part of year.parts) {
      let typesSum = 0,
          lastTypeOffset = 0,
          svg = [],
          tds = []
      part.types.orderBy('name');

      for (let type of part.types) {
        svg.push(`<rect x="${lastTypeOffset}" width="${type.sum.round(0)}" height="100%" fill="${type.bgColor}" />`);
        typesSum += type.sum;
        lastTypeOffset += type.sum.round(0);
      }

      if (currentYear != year) {
        currentYear = year;
        tds.push(`<td class="bubbleTd" rowspan="${year.parts.length}">${year.name}</td>`);
        tds.push(`<td class="bubbleTd" rowspan="${year.parts.length}">${year.sum.round(0)}</td>`);
      }

      if (groupBy != 12) {
        tds.push(`<td class="bubbleTd">${part.name.convertToRoman()}</td>`);
        tds.push(`<td class="bubbleTd">${typesSum.round(0)}</td>`);
        tds.push(`<td class="bubbleTd">${(typesSum / part.days).round(1)}</td>`);
      }

      tds.push(`<td><svg height="20px" width="${typesSum.round(0)}px" xmlns="http://www.w3.org/2000/svg" display="block">${svg}</svg></td>`);
      trs.push(`<tr>${tds.join('')}</tr>`)
    }
  }

  document.getElementById('__rep_CostsReportData').innerHTML = `<table>${trs.join('')}</table>`;
  aaf.contentTabs.active('treeView');
};

monUpdateRates = async () => {
  try {
    let response = await fetch('https://openexchangerates.org/api/latest.json?app_id=87daff001ce54adcb026f28899a098ca');
    if (response.ok) {
      let json = await response.json(),
          currencies = await aaf.getStoreRecords('MON_Currencies');
      for (let rec of currencies) {
        rec.date = new Date().toYMD();
        rec.amount = (json.rates[rec.code] / json.rates['EUR']).toFixed(4);
      }
      await aaf.iudStoreData('update', 'MON_Currencies', currencies);
      aaf.dbSchema.find(x => x.name == 'MON_Currencies').data = currencies;
      document.getElementById('grid').innerHTML = await aaf.getGrid();
    }
  } catch (error) {
    aaf.log(error);
    return;
  }
};

monUpdateMissingRates = async () => {
  let costsToUpdate = [],
      incomesToUpdate = [],
      newRates = [],
      oldRates = await aaf.getStoreRecords('MON_Rates'),
      currencies = await aaf.getStoreRecords('MON_Currencies');

  for (const storeName of ['CAR_Refueling', 'MON_Costs', 'MON_Incomes', 'MON_Debts']) {
    let storeData = await aaf.getStoreRecords(storeName),
        toUpdate = [];
    for (const rec of storeData) {
      if (rec.currencyId == 9) continue; // EUR
      if (oldRates.find(x => x.date == rec.date && x.currencyId == rec.currencyId) != undefined) continue;
      toUpdate.push(rec);
      if (newRates.find(x => x.date == rec.date && x.currencyId == rec.currencyId) != undefined) continue;
      newRates.push({date: rec.date, currencyId: rec.currencyId});  
    }
    switch (storeName) {
      case 'MON_Costs': costsToUpdate = toUpdate; break;
      case 'MON_Incomes': incomesToUpdate = toUpdate;
    }
  }
  
  // Get Historical Rates
  try {
    for (let rate of newRates) {
      let response = await fetch(`https://openexchangerates.org/api/historical/${rate.date}.json?app_id=87daff001ce54adcb026f28899a098ca`);
      if (!response.ok) continue;
      let json = await response.json(),
          code = currencies.find(x => x.id == rate.currencyId).code;
      rate.amount = (json.rates[code] / json.rates['EUR']).toFixed(4);
    }
  } catch (error) {
    aaf.log(error);
    return;
  }  

  let updateEUR = function (data) {
    for (let rec of data) {
      let rate = newRates.find(x => x.date == rec.date && x.currencyId == rec.currencyId);
      rec.eur = (rec.amount / rate.amount).round(2);
    }
  };

  updateEUR(costsToUpdate);
  updateEUR(incomesToUpdate);
  await aaf.iudStoreData('update', 'MON_Costs', costsToUpdate);
  await aaf.iudStoreData('update', 'MON_Incomes', incomesToUpdate);
  await aaf.iudStoreData('insert', 'MON_Rates', newRates);
  delete aaf.dbSchema.find(x => x.name == 'MON_Costs').data;
  delete aaf.dbSchema.find(x => x.name == 'MON_Incomes').data;
  delete aaf.dbSchema.find(x => x.name == 'MON_Rates').data;
  await carUpdateDieselPricePerKm();
  await carUpdatePricePerDrives();
  aaf.log('Done', true);
};
