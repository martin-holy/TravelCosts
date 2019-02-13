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
    let ratesList = await aaf.getStoreRecords('MON_RatesList');
    rate = ratesList.find(r => r.currencyId == rec.currencyId);
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
      if (!found) store.delete(ppk);
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

    const storeName = 'CAR_Drives';
    let arrDrives = Array.from(await aaf.getStoreRecords(storeName)).orderBy('kmTotal'),
        arrPricePerKm = await aaf.getStoreRecords('CAR_PricePerKm'),
        tx = aaf.db.transaction([storeName], 'readwrite'),
        store = tx.objectStore(storeName),
        kmFrom = 156327; // stav při koupení auta

    tx.oncomplete = async () => {
      delete aaf.dbSchema.find(s => s.name == storeName).data;
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
    let forCreate = [],
        forSet = [],
        typesSelect = xSelect('__rep_costTypeId');

    costTypes.forEach(x => {
      forCreate.push({value: x.id, name: x.name, bgColor: x.bgColor});
      forSet.push(x.id);
    });

    typesSelect.create(forCreate, true, true);
    typesSelect.set(forSet);
    typesSelect.element.dataset.onchange = 'monCostsReport';

    document.getElementById('treeView').innerHTML = `
      <div id="__rep_CostsReport">
        <div>
          <select id="__rep_groupBy" onchange="monCostsReport();">
            <option value="1">1 Month</option>
            <option value="3">3 Months</option>
            <option value="6">6 Months</option>
            <option value="12">1 Year</option>
          </select>
          ${typesSelect.element.outerHTML}
        </div>
        <div id="__rep_CostsReportData"></div>
      </div>`;
 
  }

  let selectedCostTypes = xSelect('__rep_costTypeId').get();
  if (selectedCostTypes.length == 0) return;
  
  let groupBy = document.getElementById('__rep_groupBy').value,
      records = await aaf.getStoreRecords('MON_Costs'),
      transportData = await monGetTransportData(1),  // 1 = Martin //TODO get it from settings
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
      dataPart = { name: part, sum: 0, types: [] };
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

  let output = '<table>',
      currentYear;
  years.orderBy('name', false);
  for (let year of years) {
    year.parts.orderBy('name', false);
    for (let part of year.parts) {
      let typesSum = 0,
          lastTypeOffset = 0,
          svg = '';
      part.types.orderBy('name');
      for (let type of part.types) {
        svg += `<rect x="${lastTypeOffset}" width="${type.sum.round(0)}" height="100%" fill="${type.bgColor}" />`;
        typesSum += type.sum;
        lastTypeOffset += type.sum.round(0);
      }

      output += '<tr>';

      if (currentYear != year) {
        currentYear = year;
        output += `<td class="bubbleTd" rowspan="${year.parts.length}">${year.name}</td>
                   <td class="bubbleTd" rowspan="${year.parts.length}">${year.sum.round(0)}</td>`;
      }

      if (groupBy != 12)
        output += `
          <td class="bubbleTd">${part.name.convertToRoman()}</td>
          <td class="bubbleTd">${typesSum.round(0)}</td>`;
          
      output += `<td><svg height="20px" width="${typesSum.round(0)}px" xmlns="http://www.w3.org/2000/svg" display="block">${svg}</svg></td></tr>`;
    }
  }
  output += '</table>';
  document.getElementById('__rep_CostsReportData').innerHTML = output;

  aaf.contentTabs.active('treeView');
};