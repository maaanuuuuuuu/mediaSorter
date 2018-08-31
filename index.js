#!/usr/bin/env node 
const fs = require('fs')
const guessIt = require('guessit-wrapper')
const OMDB = require('imdb-api')
const conf = require('./conf.json')

const app = {
  genrePriorities: [],
  run: () => {
    let fileList = app.listFiles(conf.sourceDir, [])
    app.guessFilmListPromise(fileList).then((filmsList) => {
      app.generateGenrePriorities(filmsList)
      app.moveFilms(filmsList)
    }).catch((error) => {
      console.log(error)
    })
  },
  getSortedKeys: (obj) => {
    let keys = []
    Object.keys(obj).forEach(key => keys.push(key))
    return keys.sort((a,b) => obj[b]-obj[a])
  },
  generateGenrePriorities: (filmsList) => {
    let genreNumbers = {}
    filmsList.forEach((file) => {
      let genres = []
      if (file.genres !== undefined) {
        genres = file.genres.split(",").map(genre => genre.trim())
      } else {
        genres.push('unknown')
      }
      genres.forEach((genre) => {
        if (genreNumbers[genre] === undefined) {
          genreNumbers[genre] = 1
        } else {
          genreNumbers[genre]++
        }
      })
    })
    app.genrePriorities = app.getSortedKeys(genreNumbers)
  },
  selectGenre: (film) => {
    if (film.genres === undefined) return 'unknown'
    for (let index = 0; index < app.genrePriorities.length; index++) {
      const genre = app.genrePriorities[index];
      let genres = film.genres.split(",").map(aGenre => aGenre.trim())
      if (genres.indexOf(genre) !== -1) {
        return genre
      }
    }
  },
  generateNewFileName: (film) => {
    //The Grand Budapest Hotel (2014).mp4
    let title = film.name || film.title
    let genre = app.selectGenre(film)
    let date = film.year ? ' (' + film.year + ')' : ''
    let extension = film.file.split('.').pop()
    let fileName = conf.destDir + genre + '/' + title + '' + date + '.' + extension
    if (!fs.existsSync(conf.destDir) && !conf.testMode){
      fs.mkdirSync(conf.destDir)
    }
    if (!fs.existsSync(conf.destDir + genre) && !conf.testMode){
      fs.mkdirSync(conf.destDir + genre)
    }
    return fileName
  },
  moveFilms: (fileList) => {
    fileList.forEach(file => {
      let oldFile = file.dir+file.file
      let newFile = app.generateNewFileName(file)
      if (conf.testMode) {
        console.log(oldFile + '->' + newFile)
      } else {
        fs.exists(newFile, function(exists){
          if (!exists) {
            fs.rename(oldFile, newFile, (err) => {
              if (err) throw err
              console.log(file.title + ' moved to ' + newFile)
            })
          }
        })
      }
    })
  },
  getAdditionalInfosListPromise: (filmList) => {
    let promise = new Promise((resolve, reject) => {
      let allPromises = []
      filmList.forEach(function(film) {
        allPromises.push(app.getAdditionalInfosPromise(film))
      })
      Promise.all(allPromises).then((values) => {
        resolve(values)
      }).catch((error) => {
        reject(error)
      })
    })
    return promise
  },
  getAdditionalInfosPromise: (film) => {
    let promise = new Promise((resolve, reject) => {
      OMDB.get({name: film.title}, {apiKey: conf.omdbAPIKey, timeout: 30000}).then((newInfos) => {
        resolve({
          ...newInfos,
          ...film
        })
      }).catch((error) => {
        resolve(film)
      })
    })

    return promise
  },
  guessFilmListPromise: (fileList) => {
    let promise = new Promise((resolve, reject) => {
      let allPromises = []
      fileList.forEach(function(file) {
        allPromises.push(app.guessFilmPromise(file))
      })
      Promise.all(allPromises).then((filmList) => {
        return app.getAdditionalInfosListPromise(filmList)
      }).then((values) => {
        resolve(values)
      }).catch((error) => {
        reject(error)
      })
    })
    return promise
  },
  guessFilmPromise: (file) => {
    let promise =  new Promise((resolve) => {
      guessIt.parseName(file.file).then(function (data) {
        resolve({
          ...file,
          ...data
        })
      })
    })

    return promise
  },
  listFiles: (dir, fileList) => {
    let files = fs.readdirSync(dir)
    fileList =  fileList || []
    files.forEach(function(file) {
      if (fs.statSync(dir + file).isDirectory()) {
        fileList = app.listFiles(dir + file + '/', fileList)
      } else {
        let film = {
          dir: dir,
          file: file
        }
        fileList.push(film)
      }
    })
    return fileList
  }
}

app.run()

module.exports = app