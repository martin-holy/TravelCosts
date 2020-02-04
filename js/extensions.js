if (!Date.prototype.format) {
// ReSharper disable once NativeTypePrototypeExtending
  Date.prototype.format = function (format) //author: meizz
  {
    const o = {
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
      (this.getFullYear() + '').substr(4 - RegExp.$1.length));
    for (const k in o)
      if (new RegExp('(' + k + ')').test(format))
        format = format.replace(RegExp.$1,
          RegExp.$1.length === 1 ? o[k] :
          ('00' + o[k]).substr(('' + o[k]).length));
    return format;
  };
}

if (!Date.prototype.getDOY) {
// ReSharper disable once NativeTypePrototypeExtending
  Date.prototype.getDOY = function () {
    const onejan = new Date(this.getFullYear(), 0, 1);
    return Math.ceil((this - onejan) / 86400000);
  };
}

if (!Date.prototype.toYMD) {
// ReSharper disable once NativeTypePrototypeExtending
  Date.prototype.toYMD = function (sep = '-') {
    return [
      this.getFullYear(),
      ('0' + (this.getMonth() + 1)).slice(-2),
      ('0' + this.getDate()).slice(-2)
    ].join(sep);
  };
}

if (!Date.prototype.addDays) {
// ReSharper disable once NativeTypePrototypeExtending
  Date.prototype.addDays = function(days) {
    return this.setDate(this.getDate() + days) && this;
  };
}

function daysInYear(y) {
  return Math.floor((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / (24 * 60 * 60 * 1000));
}

if (!Number.prototype.round) {
// ReSharper disable once NativeTypePrototypeExtending
  Number.prototype.round = function(places) {
    places = Math.pow(10, places);
    return Math.round(this * places) / places;
  };
}

if (!Array.prototype.orderBy) {
// ReSharper disable once NativeTypePrototypeExtending
  Array.prototype.orderBy = function(orderBy, asc = true) {
    return this.sort((a, b) => {
      const valA = a[orderBy],
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
      const options = [],
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
      const values = [];
      this.element.querySelectorAll('.optionSelected').forEach(x => values.push(x.value));
      return values;
    },

    set: function (data) {
      this.element.querySelectorAll('li').forEach(x => 
        x.classList.toggle('optionSelected', data.includes(x.value)));
      this.list();
    },

    select: function(li) {
      if (this.element.dataset.multi === 'false') {
        this.element.querySelectorAll('li').forEach(x => x.classList.remove('optionSelected'));
        this.show();
      }
      li.classList.toggle('optionSelected');
      this.list();
    },

    list: function() {
      const out = [],
            dataSource = JSON.parse(this.element.dataset.dataSource || null);

      this.element.querySelectorAll('.optionSelected').forEach(x => {
        let style = '';

        if (dataSource != null) {
          const bgColor = dataSource.find(ds => ds.value === x.value).bgColor; 
          if (bgColor !== undefined)
            style = ` style="background-color:${bgColor};"`;
        }

        out.push(`<span${style}>${x.textContent}</span>`);
      });

      this.element.querySelector('.selectedOptions').innerHTML = out.join('');

      if (this.element.dataset.onchange) {
        const nss = this.element.dataset.onchange.split('.'),
              func = nss.pop();
        let context = window;
        for (let i = 0; i < nss.length; i++)
          context = context[nss[i]];

        context[func].apply(context);
      }
    },

    show: function() {
      const ul = this.element.querySelector('ul'),
            hide = ul.style.visibility === 'visible';
          
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

      for (const elm of Array.from(document.getElementsByClassName('xSelect'))) {
        if (elm.querySelector('ul').style.visibility === 'visible' && elm !== select) 
          xSelect(elm.id).show(); // hide
      }
    }
  };
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// get days as years months days
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

const DOM = {
  createElement(tag, id, classes) {
    const elm = document.createElement(tag);
    if (id) elm.id = id;
    if (classes) elm.className = classes;
    return elm;
  }
};
