if (!Date.prototype.format) {
  Date.prototype.format = function (format) //author: meizz
  {
    var o = {
      "M+": this.getMonth() + 1, //month
      "d+": this.getDate(), //day
      "h+": this.getHours(), //hour
      "m+": this.getMinutes(), //minute
      "s+": this.getSeconds(), //second
      "q+": Math.floor((this.getMonth() + 3) / 3), //quarter
      "S": this.getMilliseconds() //millisecond
    }

    if (/(y+)/.test(format))
      format = format.replace(RegExp.$1,
      (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
      if (new RegExp("(" + k + ")").test(format))
        format = format.replace(RegExp.$1,
          RegExp.$1.length == 1 ? o[k] :
          ("00" + o[k]).substr(("" + o[k]).length));
    return format;
  };
}

if (!Date.prototype.getDOY) {
  Date.prototype.getDOY = function () {
    var onejan = new Date(this.getFullYear(), 0, 1);
    return Math.ceil((this - onejan) / 86400000);
  };
}

if (!Date.prototype.toYMD) {
  Date.prototype.toYMD = function () {
    return [
      this.getFullYear(),
      ('0' + (this.getMonth() + 1)).slice(-2),
      ('0' + this.getDate()).slice(-2)
    ].join('-');
  };
}

if (!Date.prototype.addDays) {
  Date.prototype.addDays = function(days) {
    return this.setDate(this.getDate() + days) && this;
  };
}

function daysInYear(y) {
  return Math.floor((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / (24 * 60 * 60 * 1000));
}

if (!Number.prototype.round) {
  Number.prototype.round = function(places) {
    places = Math.pow(10, places);
    return Math.round(this * places) / places;
  };
}

if (!Number.prototype.convertToRoman) {
  Number.prototype.convertToRoman = function() {
    let roman = {
      M: 1000,
      CM: 900,
      D: 500,
      CD: 400,
      C: 100,
      XC: 90,
      L: 50,
      XL: 40,
      X: 10,
      IX: 9,
      V: 5,
      IV: 4,
      I: 1
    },
    str = '',
    num = this;

    for (let i of Object.keys(roman)) {
      let q = Math.floor(num / roman[i]);
      num -= q * roman[i];
      str += i.repeat(q);
    }

    return str;
  };
}

if (!Array.prototype.orderBy) {
  Array.prototype.orderBy = function(orderBy, asc = true) {
    return this.sort((a, b) => {
      let valA = a[orderBy],
          valB = b[orderBy];
      if (valA < valB) return asc ? -1 : 1;
      if (valA > valB) return asc ? 1 : -1;
      return 0;
    });
  };
}

var xSelect = function(id) {
  return { 
    element: document.getElementById(id),

    create: function (data, multi = true, withDataSource = false) {
      let options = [],
          elm = document.createElement('div');
      
      data.forEach(x => options.push(`<li value='${x.value}' onclick="xSelect('${id}').select(this);">${x.name}</li>`));
      elm.id = id;
      elm.className = 'xSelect';
      elm.dataset.multi = multi;
      if (withDataSource) elm.dataset.dataSource = JSON.stringify(data);
      elm.innerHTML =
        `<div onclick="xSelect('${id}').show();">
          <div class="selectedOptions"></div>
          <div class="button">▼</div>
        </div>
        <ul>${options.join('')}</ul>`;

      this.element = elm;
    },

    get: function() {
      let vals = [];
      this.element.querySelectorAll('.optionSelected').forEach(x => vals.push(x.value));
      return vals;
    },

    set: function (data) {
      this.element.querySelectorAll('li').forEach(x => 
        x.classList.toggle('optionSelected', data.includes(x.value)));
      this.list();
    },

    select: function(li) {
      if (this.element.dataset.multi == 'false') {
        this.element.querySelectorAll('li').forEach(x => x.classList.remove('optionSelected'));
        this.show();
      }
      li.classList.toggle('optionSelected');
      this.list();
    },

    list: function() {
      let out = [],
          dataSource = JSON.parse(this.element.dataset.dataSource || null);

      this.element.querySelectorAll('.optionSelected').forEach(x => {
        let style = '';

        if (dataSource != null) {
          let bgColor = dataSource.find(ds => ds.value == x.value).bgColor; 
          if (bgColor !== undefined)
            style = ` style="background-color:${bgColor};"`;
        }

        out.push(`<span${style}>${x.textContent}</span>`);
      });

      this.element.querySelector('.selectedOptions').innerHTML = out.join('');

      if (this.element.dataset.onchange)
        window[this.element.dataset.onchange]();
    },

    show: function() {
      let ul = this.element.querySelector('ul'),
          hide = ul.style.visibility == 'visible';
          
      ul.style.visibility = hide ? 'hidden' : 'visible';
      this.element.querySelector('.button').innerHTML = hide ? '▼' : '✔';
      
      if (hide) window.removeEventListener('mouseup', this.xSelectClose);
      else window.addEventListener('mouseup', this.xSelectClose);
    },

    xSelectClose: function(e) {
      let currentElm = e.target,
          select;

      while (currentElm) {
        if (currentElm.classList.contains('xSelect')) {
          select = currentElm;
          break;
        }
        currentElm = currentElm.parentElement;
      }

      for (let elm of Array.from(document.getElementsByClassName('xSelect'))) {
        if (elm.querySelector('ul').style.visibility == 'visible' && elm != select) 
          xSelect(elm.id).show(); // hide
      }
    }
  };
}

var getHttpRequest = function (url) {
  return new Promise((resolve, reject) => {
    let httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = () => {
      if (this.readyState == 4 && this.status == 200)
        resolve(this.responseText);
    }
    httpRequest.open('GET', url, true);
    httpRequest.send();
  });
};