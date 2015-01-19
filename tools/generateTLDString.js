// Please run in Browser context (Environment menu -> Browser)
(function(d, w) {
  var xhr = new XMLHttpRequest();
//   xhr.onload = function() {
//     process(this.responseText);
//   };
  xhr.open("get", "https://publicsuffix.org/list/effective_tld_names.dat", false);
  xhr.send();
  return process(xhr.responseText);
  
  function process(text) {
    let tlds = [];
    let tree = Object.create(null);
    
    function separateTLDs() {
      let ptr = 0, last = 0;
      while (ptr < text.length) {
        if (text[ptr] == '\r' || text[ptr] == '\n') {
          processTLD(text.substring(last, ptr))
          while (ptr < text.length && (text[ptr] == '\r' || text[ptr] == '\n'))
            ptr++;
          last = ptr;
        } else {
          ptr++;
        }
      }
      if (last != ptr) {
        processTLD(text.substring(last, ptr));
      }
    }
    function processTLD(tld) {
      tld = tld.trim();
      if (tld.length && tld.substring(0, 2) != "//")
        tlds.push(tld);
    }
    function processTree() {
      tlds.forEach(function(tld) {
        let parts = tld.split(".");
        let treepart = tree;
        for (let i = parts.length - 1; i >= 0; i--) {
          let part = parts[i];
          treepart = treepart[part] || (treepart[part] = Object.create(null));
        }
      })
    }
    function stringify(node) {
      let builder = [];
      let keys = Object.keys(node);
      if (keys.length) {
        builder.push("(" + keys.length + ":" + keys[0]);
        builder.push(stringify(node[keys[0]]));
        for (let i = 1, l = keys.length; i < l; i++) {
          builder.push("," + keys[i]);
          builder.push(stringify(node[keys[i]]));
        };
        builder.push(")");
      }
      return builder.join("");
    }
    
    separateTLDs();
    processTree();
    return "root" + stringify(tree);
  }
})(document, window);
