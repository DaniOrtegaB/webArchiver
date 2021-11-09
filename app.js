const express = require('express');
const fetch = require('node-fetch');
const cheerio = require ('cheerio');
const stream = require('stream');
const path = require('path');
const archiver = require('archiver');


var fs = require('fs');



function getTransformStream(url, recLevel, replaceManager, doCrawlAndDownloadResource) {
  let transformStream = new stream.Transform();
  let buffer='';

  transformStream._transform = function(chunk, encoding, callback) {
    buffer += chunk.toString();
    callback();
  };

  transformStream._flush = function(callback){
    this.push(transformStream._replace(buffer));
    callback();
  }

  transformStream._replace = function(chunk){
      $ = cheerio.load(chunk);
      $('a').each(function (i, link){
        let href = $(this).attr('href');
        let downloadableURL = URLManager.getDownloadableURL(url,href);
        let newhref = replaceManager.lookupName(downloadableURL);
        $(this).attr('href', newhref);

        doCrawlAndDownloadResource(downloadableURL, recLevel - 1, newhref);
      }); //end $a.each
      return $.html();
  };
  

  return transformStream;
}//end getTransformStream

//TODO function function URLManager()
//var path = require('path');
function URLManager() {
  this.getResourceExtenssion = function(uri) {
    //var path = require('path');
    let extension = "";
    //The following expresion gets the resource expression, if it doesnt exists, return empty string
    //extension = path.extname(new URL(uri).pathname);
    extension = path.extname(uri.pathname);
    //Default extension as .html
    switch(extension) {
      case  ".html":
        break;
      case ".pdf":
        break;
      case ".docx":
        break;
      case ".doc":
        break;
      default:
        extension = ".html";
    }
    return extension;
  }


  //var ext = this.getResourceExtenssion("http://foo.com/a.pdf");
  //console.log(ext);


  //var path = require('path');
  this.getDownloadableURL = function(urlParent, href) {
    //Hem substituit l'anterior codi, que causava errors ens alguns casos, ara retornem directament un objecte URL
    return (new URL(href, urlParent));

  }

  //var ur = this.getDownloadableURL("http://stw.deic-docencia.uab.cat/nodeJS/webArchiver/test.html","test_1_1.html");
  //console.log(ur);
}

  //var ur = URLManager.getDownloadableURL("http://stw.deic-docencia.uab.cat/nodeJS/webArchiver/test.html","test_1_1.html");
  //console.log(ur);

//var path = require('path');
function ReplaceManager(maxFiles) {
  this._fileCounter = 0;
  this._replaceMap = {};
  this.NOT_FOUND_FILE = "404.html"

  this.lookupName = function(_url) {
    
    let extension = "";
    
    //mirar si _url esta al diccionari
    if(_url in this._replaceMap){
      //retornem valor del index (value del diccionari)
      return this._replaceMap[_url];
    } else {
          if(this._fileCounter<maxFiles) {
              this._fileCounter++;
              //si es la primera entrada
              if(Object.entries(this._replaceMap).length === 0) {
                extension = "index.html";
              }
          }else{//si estem al limit
            extension = this.NOT_FOUND_FILE;
          }
      //agafar extensio de la _url si no s'ha complert cap altre cas
      if(extension==""){
        //myURL = new URLManager();
        //minus 1 because index.html don't count as 1.html but is index
        extension = (this._fileCounter-1).toString() + URLManager.getResourceExtenssion(new URL(_url));
      }

      this._replaceMap[_url] = extension;
      
      return extension;
    }

  }
}


/*var r = new ReplaceManager(4);
console.log(r._replaceMap['http://stw.deic-docencia.uab.cat/nodeJS/webArchiver/test.html']);
console.log(r.lookupName('http://stw.deic-docencia.uab.cat/nodeJS/webArchiver/test.html'));
console.log(r.lookupName('http://stw.deic-docencia.uab.cat/nodeJS/webArchiver/test_1_1.html'));
console.log(r.lookupName('http://stw.deic-docencia.uab.cat/nodeJS/webArchiver/test_1_2.html'));
console.log(r.lookupName('http://stw.deic-docencia.uab.cat/nodeJS/webArchiver/test_1_1.html'));
 */

  //sense recursivitat, ha de encapsular en un zip amb entrada index.html


//Sessio 1 //http://stw.deic-docencia.uab.cat/nodeJS/webArchiver/test.html
URLManager = new URLManager();
function startCrawling(req, response){
  
  let downloadedFiles = [];
  let url =  req.query.url;
  let recLevel = req.query.nivells;
  let maxFiles = req.query.fitxers;
  contadorIntern = 0;
  contadorExtern = 0;
  //demanem el nom del recurs a partir de ReplaceManager
  RM = new ReplaceManager(maxFiles);
  let entryName = RM.lookupName(url);
     
  var zip = archiver('zip', {
    zlib: { level: 9 },
    name: '1.zip'
  });


  //Guardar-ho a downlaodedFiles
  //Decidir dins de la funció si descarreguem URL, -> maxim nivell recursivitat, o maxFiles o si ja està descaregada
  function doCrawlAndDownloadResource(url, recLevel, entryName) {
    if (recLevel > 0 && maxFiles > downloadedFiles.length && !downloadedFiles.includes(entryName)) {
      downloadedFiles.push(entryName);
      contadorExtern++;

      fetch(url).then( x => {
        zip.on('warning', function(err) {
          if (err.code === 'ENOENT') {
            console.log("warning err code");
          } else {            // throw error
            throw err;
          }
        });


        streamPag = x.body.pipe(getTransformStream(url, recLevel, RM , doCrawlAndDownloadResource));

          streamPag.on('finish', function() {
            contadorIntern++;

            if(contadorIntern==contadorExtern) {
              zip.finalize();
              zip.pipe(response);
            }
          });

        zip.append(streamPag, {    
          name: entryName,
        });

        zip.on('finish', function() {
          console.log("zip sent");
          response.end(); 
        });


        });
      }
    };
    
    doCrawlAndDownloadResource(url, recLevel, entryName);

  
}



const app = express();
const port = 3000



app.use(express.static(path.join(__dirname, 'public')));

//here goes the routing
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '/', 'index.html'));
})

app.get('/crawler', function(req, response) {

  response.writeHead(200, {'Content-Type': 'application/zip', 'Content-Disposition' : 'attachment; filename=files.zip' });
  startCrawling(req, response);

})


app.listen(port, () => console.log(`Example app listening on port ${port}!`));
