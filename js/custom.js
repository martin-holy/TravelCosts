var hardCoded = {
  monTransportCostTypeId: 3,
  monEURCurrencyId: 9,
  carDieselCostTypeId: 3,
  carAmortizationCostTypeId: 4,
  carUnknownConsumption: 7.3,
  carUnknownConsumptionForKm: 3000,
  carAmortizationUntilTotalKm: 300000,
  carTotalKmStart: 156327, // stav při koupení auta
  gloPeopleCarryId: 3,
  openExchangeRatesApiId: '87daff001ce54adcb026f28899a098ca'
};

// gets actual rate for a day or last actual rate if not found
amountInEUR = async (rec, roundTo = 2) => {
  if (rec.currencyId === hardCoded.monEURCurrencyId)
    return rec.amount;

  let rate = (await appStores.MON_Rates.data())
    .find(x => x.date === rec.date && x.currencyId === rec.currencyId);

  if (!rate)
    rate = (await appStores.MON_Currencies.data())
      .find(x => x.id === rec.currencyId);

  return rate ? (rec.amount / rate.amount).round(roundTo) : 0;
};

// gets number of days between rec.dateFrom and rec.dateTo
numberOfDaysBetween = (rec) => {
  const a = new Date(rec.dateFrom).setHours(0, 0, 0, 0),
        b = new Date(rec.dateTo == null ? Date.now() : rec.dateTo).setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000 + 1);
};

// recalculate consumptions for all refueling
carCalcConsumptions = async () => {
  const refueling = await appStores.CAR_Refueling.data({ orderBy: 'kmTotal' });
  let kmFrom = 0,
      l = 0;

  for (let ref of refueling) {
    if (kmFrom === 0) {
      kmFrom = ref.kmTotal;
      ref.consumption = 0;
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
  }

  await appStores.CAR_Refueling.update(refueling);
  await carUpdateDieselPricePerKm();
  appStores.CAR_Refueling.data({sorted: true}).then((gridItems) => {
    app.form.grid.create(appStores.CAR_Refueling.dbSchema, gridItems, true);
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
    let refueling = Array.from(await appStores.CAR_Refueling.data()).orderBy('kmTotal'),
        arrLiters = [],
        arrPrice = [],
        arrKm = [],
        litersFrom = 0,
        litersTotal = 0,
        lastLitersTotal = 0,
        kmFrom = 0;

    for (let ref of refueling) {
      // | kmFrom | kmTo | consumption | litersFrom | litersTo |
      if (kmFrom !== 0) litersTotal += ref.liters;
      if (ref.fullTank) {
        if (kmFrom !== 0) {
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
    let lastPrice = arrPrice[arrPrice.length - 1];
    arrPrice.push({
      kmFrom: lastPrice.kmTo,
      kmTo: lastPrice.kmTo + hardCoded.carUnknownConsumptionForKm,
      consumption: hardCoded.carUnknownConsumption,
      EURPerL: lastPrice.EURPerL
    });

    //Adding eurTotal, eurPerKm and found flag
    //Rounding km
    for (let price of arrPrice) {
      price.kmFrom = price.kmFrom.round(0);
      price.kmTo = price.kmTo.round(0);
      price.eurTotal = ((price.consumption / 100.0) * (price.kmTo - price.kmFrom) * price.EURPerL).round(3);
      price.eur = (price.eurTotal / (price.kmTo - price.kmFrom)).round(3);
      price.costTypeId = hardCoded.carDieselCostTypeId;
      price.found = false;
    }

    let arrPricePerKmDiesel = (await appStores.CAR_PricePerKm.data()).filter(p => p.costTypeId === hardCoded.carDieselCostTypeId),
        tx = app.DB.db.transaction(['CAR_PricePerKm'], 'readwrite'),
        store = tx.objectStore('CAR_PricePerKm'),
        found = false;

    tx.oncomplete = () => {
      delete appStores.CAR_PricePerKm.cache;
      resolve();
    };

    //Comparing data
    for (let ppk of arrPricePerKmDiesel) {
      found = false;
      for (let p of arrPrice) {
        if (ppk.kmFrom === p.kmFrom && ppk.kmTo === p.kmTo && ppk.eurTotal === p.eurTotal) {
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

carUpdateAmortizationPricePerKm = async () => {
  const arrPricePerKmAmorti = (await appStores.CAR_PricePerKm.data()).filter(p => p.costTypeId === hardCoded.carAmortizationCostTypeId);
  let lastKmTotal = (await appStores.CAR_Drives.data({orderBy: 'kmTotal', orderAsc: false}))[0];

  // Extending Amortization
  lastKmTotal = lastKmTotal ? lastKmTotal.kmTotal : hardCoded.carAmortizationUntilTotalKm;
  for (let a of arrPricePerKmAmorti) {
    a.kmTo = lastKmTotal;
    a.eur = (a.eurTotal / (a.kmTo - a.kmFrom)).round(5);
  }

  await appStores.CAR_PricePerKm.update(arrPricePerKmAmorti);
};

carUpdatePricePerDrives = async () => {
  await carUpdateAmortizationPricePerKm();

  const arrDrives = await appStores.CAR_Drives.data({ orderBy: 'kmTotal' }),
        arrPricePerKm = await appStores.CAR_PricePerKm.data();
  let kmFrom = hardCoded.carTotalKmStart; 

  for (let drv of arrDrives) {
    let eur = 0;
    drv.km = drv.kmTotal - kmFrom;

    for (let price of arrPricePerKm) {
      if (price.kmTo <= kmFrom || price.kmFrom >= drv.kmTotal) continue;

      const pricePerKm = price.eurTotal / (price.kmTo - price.kmFrom),
            from = price.kmFrom < kmFrom ? kmFrom : price.kmFrom,
            to = price.kmTo > drv.kmTotal ? drv.kmTotal : price.kmTo;

      eur += (to - from) * pricePerKm;
    }

    drv.eur = eur.round(2);
    kmFrom = drv.kmTotal;
  }

  await appStores.CAR_Drives.update(arrDrives);
};

getMonthIntervals = (yearFrom, yearTo) => {
  const monthIntervals = [];
  for (let y = yearFrom; y < yearTo + 1; y++) {
    for (let m = 0; m < 12; m++) {
      monthIntervals.push({ 
        dateFrom: new Date(y, m, 1).toYMD(), 
        dateTo: new Date(y, m + 1, 0).toYMD() });
    }
  }
  return monthIntervals;
};

combineDateIntervals = (arrays, nullDateTo) => {
  const from = new Set(),
        to = new Set();

  // getting dates from and dates to
  arrays.forEach(a => a.forEach(x => {
    const dateTo = x.dateTo == null ? nullDateTo : x.dateTo;
    from.add(x.dateFrom);
    from.add(new Date(dateTo).addDays(1).toYMD());
    to.add(dateTo);
    to.add(new Date(x.dateFrom).addDays(-1).toYMD());
  }));

  const arrFrom = [...from].sort(),
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
      const dataDateTo = d.dateTo == null ? new Date().toYMD() : d.dateTo;
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
        const from = price.dateFrom < i.dateFrom ? i.dateFrom : price.dateFrom,
              to = price.dateTo > i.dateTo ? i.dateTo : price.dateTo,
              pricePerDay = price.eurTotal / numberOfDaysBetween(price);

        eur += numberOfDaysBetween({dateFrom: from, dateTo: to}) * pricePerDay;
      }
    }
    i.eurTotal = eur;
  }
};

monGetPricesByDay = async () => {
  const presencePerDay = Array.from(await appStores.CAR_PresencePerDay.data()),
        pricesPerDay = Array.from(await appStores.CAR_PricePerDay.data()),
        intervals = combineDateIntervals([presencePerDay], new Date().toYMD());

  mapDataToIntervals(presencePerDay, 'people', intervals);
  mapDataToIntervals(pricesPerDay, 'prices', intervals);
  splitPriceInIntervals(intervals);
  
  return intervals;
};

monDebtsCalc = async () => {
  let presencePerDay = Array.from(await appStores.CAR_PresencePerDay.data()),
      intervals = await monGetPricesByDay(),
      people = [];
      
  for (let p of presencePerDay) {
    people.push({id: p.personId, eur: 0});
  }

  for (let i of intervals) {
    let eurPerPerson = i.eurTotal / i.people.length;
    for (let p of i.people) {
      people.find(x => x.id === p.personId).eur += eurPerPerson;
    }
  }

  // CALCULATING PRICE FOR DIESEL, OIL, AMORTIZATION, TIRES => DRIVES
  let drives = await appStores.CAR_Drives.data();
  for (let drv of drives) {
    let eurPerPerson = drv.eur / drv.people.length;
    for (let pId of drv.people) {
      people.find(p => p.id === pId).eur += eurPerPerson;
    }
  }

  // CALCULATING DEBTS RECORDS
  let debts = await appStores.MON_Debts.data(),
      pairs = [];
  for (let d of debts) {
    let pair = pairs.find(p => p.payerId === d.payerId && p.debtorId === d.debtorId);
    if (!pair) {
      pair = { payerId: d.payerId, debtorId: d.debtorId, eur: 0 };
      pairs.push(pair);
    }
    pair.eur += await amountInEUR(d);
  }

  // COMBINATING DEBTS RECORDS WITH DRIVES, MOT AND INSURANCE
  for (let pair of pairs) {
    let mp = pairs.find(p => p.payerId === pair.debtorId && p.debtorId === pair.payerId);
    pair.eurCalc = mp === undefined ? 0 : pair.eur - mp.eur;

    if (pair.debtorId === hardCoded.gloPeopleCarryId) {
      pair.eurCalc -= people.find(p => p.id === pair.payerId).eur;
    }

    if (pair.payerId === hardCoded.gloPeopleCarryId) {
      pair.eurCalc += people.find(p => p.id === pair.debtorId).eur;
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
    { name: 'payerId', title: 'Payer', type: 'select', source: { name: 'GLO_People', property: 'name' }},
    { name: 'debtorId', title: 'Debtor', type: 'select', source: { name: 'GLO_People', property: 'name' }},
    { name: 'eurCalc', title: 'EUR', align: 'right' }]};
  await app.DB.linkStores(form);
  app.form.grid.create(form, pairs, false);
};

monUpdateRates = () => {
  fetch(`https://openexchangerates.org/api/latest.json?app_id=${hardCoded.openExchangeRatesApiId}`)
    .then((response) => {
      if (response.ok)
        return response.json();
      throw new Error('Network response was not ok.');
    }).then(async (json) => {
      const currencies = await appStores.MON_Currencies.data({sorted: true}),
            date = new Date().toYMD();

      for (let rec of currencies) {
        rec.date = date;
        rec.amount = (json.rates[rec.code] / json.rates['EUR']).toFixed(4);
      }

      appStores.MON_Currencies.update(currencies);
      app.form.grid.create(appStores.MON_Currencies.dbSchema, currencies, true);
    }).catch((error) => {
      app.log(error.message, true);
    });
};

monUpdateMissingRates = async () => {
  const oldRates = await appStores.MON_Rates.data(),
        currencies = await appStores.MON_Currencies.data();
  let costsToUpdate = [],
      incomesToUpdate = [],
      newRates = [];

  for (const storeName of ['CAR_Refueling', 'MON_Costs', 'MON_Incomes', 'MON_Debts']) {
    const storeData = await appStores[storeName].data(),
          toUpdate = [];
    for (const rec of storeData) {
      if (rec.currencyId === hardCoded.monEURCurrencyId) continue;
      if (oldRates.find(x => x.date === rec.date && x.currencyId === rec.currencyId) != undefined) continue;
      toUpdate.push(rec);
      if (newRates.find(x => x.date === rec.date && x.currencyId === rec.currencyId) != undefined) continue;
      newRates.push({date: rec.date, currencyId: rec.currencyId});  
    }
    switch (storeName) {
      case 'MON_Costs': costsToUpdate = toUpdate; break;
      case 'MON_Incomes': incomesToUpdate = toUpdate;
    }
  }
  
  // Get Historical Rates of new records
  for (let rate of newRates) {
    await fetch(`https://openexchangerates.org/api/historical/${rate.date}.json?app_id=${hardCoded.openExchangeRatesApiId}`)
      .then((response) => {
        if (response.ok)
          return response.json();
        throw new Error('Network response was not ok.');
      }).then((json) => {
        const code = currencies.find(x => x.id === rate.currencyId).code;
        rate.amount = (json.rates[code] / json.rates['EUR']).toFixed(4);
      }).catch((error) => {
        app.log(error.message);
      });
  }

  newRates = newRates.filter(x => x.amount);

  const updateEur = function (data) {
    for (let rec of data) {
      const rate = newRates.find(x => x.date === rec.date && x.currencyId === rec.currencyId);
      if (!rate) continue;
      rec.eur = (rec.amount / rate.amount).round(2);
    }
  };

  updateEur(costsToUpdate);
  updateEur(incomesToUpdate);
  await appStores.MON_Costs.update(costsToUpdate);
  await appStores.MON_Incomes.update(incomesToUpdate);
  await appStores.MON_Rates.insert(newRates);
  await carUpdateDieselPricePerKm();
  await carUpdatePricePerDrives();
  app.log('Done', true);
};

testFunc = async function() {

}
