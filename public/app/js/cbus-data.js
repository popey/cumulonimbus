cbus.data = {};
cbus.data.feeds = [];
cbus.data.episodes = [];
cbus.data.feedsCache = [];
cbus.data.episodesCache = [];
cbus.data.episodesDownloading = [];
cbus.data.episodeProgresses = {};
cbus.data.state = {
  podcastDetailCurrentData: {}
};

cbus.data.USERDATA_PATH = remote.app.getPath("userData");
cbus.data.OFFLINE_STORAGE_DIR = path.join(cbus.data.USERDATA_PATH, "offline_episodes");

cbus.data.update = function(specificFeedData) {
  var requestFeedsData;

  if (specificFeedData) {
    requestFeedsData = [specificFeedData];
  } else {
    requestFeedsData = cbus.data.feeds.map(function(feed) {
      return { title: feed.title, url: feed.url }; // server.update only needs these two props
    });
  }

  cbus.server.update(requestFeedsData, function(feedContents) {
    console.log(feedContents);

    for (let feedUrl of Object.keys(feedContents)) {
      let feed = cbus.data.getFeedData({ url: feedUrl });

      for (let episode of feedContents[feedUrl].items) {
        /* check whether is duplicate */
        var episodesWithMatchingURL = [];
        for (let existingEpisode of cbus.data.episodes) {
          if (existingEpisode.url === episode.url) {
            episodesWithMatchingURL.push(existingEpisode);
          }
        }
        if (episodesWithMatchingURL.length === 0) { // not a duplicate
          cbus.data.episodes.unshift({
            id: episode.id,
              url: episode.url,
              title: episode.title[0],
              description: episode.description,
              date: (new Date(episode.date).getTime() ? new Date(episode.date) : null), // check if date is valid
              feedURL: feedUrl,
              art: episode.episodeArt,
              length: episode.length,
              chapters: episode.chapters
          }); // add to front of cbus.data.episodes
        }
      }
    }

    cbus.data.episodes.sort(function(a, b) {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return 0;
    });

    cbus.data.updateAudios();

    cbus.ui.display("episodes");

    localforage.setItem("cbus_cache_episodes", cbus.data.episodes);
    localforage.setItem("cbus_cache_episodes_time", new Date().getTime());
  });
};

cbus.data.makeAudioElem = function(episodeInfo) {
  var audioElem = document.createElement("audio");
  if (cbus.data.episodesOffline.indexOf(episodeInfo.id) === -1) {
    audioElem.src = episodeInfo.url;
  } else {
    let storageFilePath = path.join(
      cbus.data.OFFLINE_STORAGE_DIR, sha1(episodeInfo.url)
    );
    audioElem.src = URL.createObjectURL(new Blob([ fs.readFileSync(storageFilePath) ]))
  }
  audioElem.dataset.id = episodeInfo.id;
  audioElem.preload = "none";

  return audioElem;
};

cbus.data.updateAudios = function() {
  let audiosContainerElem = document.getElementsByClassName("audios")[0];

  for (let i = 0, l = Math.min(50, cbus.data.episodes.length); i < l; i++) { // because ui.display limits to 50; any more is pointless
    audiosContainerElem.appendChild(cbus.data.makeAudioElem(cbus.data.episodes[i]));
  }

  let episodeIDs = cbus.data.episodes.filter(function(episodeInfo) {
    return episodeInfo.id;
  });
  for (let i = 0, l = cbus.data.episodesUnsubbed.length; i < l; i++) {
    if (episodeIDs.indexOf(cbus.data.episodesUnsubbed[i].id) === -1) {
      audiosContainerElem.appendChild(cbus.data.makeAudioElem(cbus.data.episodesUnsubbed[i]));
    }
  }
};

cbus.data.getEpisodeElem = function(options) {
  if (options.id || (typeof options.index !== "undefined" && options.index !== null)) {
    var elem = null;

    if (options.id) {
      elem = document.querySelector("cbus-episode[data-id='" + options.id + "']");
    } else { // options.index
      elem = document.querySelectorAll("cbus-episode")[Number(options.index)];
    }

    return elem;
  }
  return false;
};

cbus.data.getEpisodeData = function(options) {
  if (options.id || (typeof options.index !== "undefined" && options.index !== null) || options.audioElement) {
    var result = null;

    if (options.id) {
      var filteredListA = cbus.data.episodes.filter(function(episode) {
        return episode.id === options.id;
      });

      if (filteredListA.length !== 0) {
        result = filteredListA[0];
      } else { // if nothing found, try episodesCache (contains only episodes from podcast-detail)
        var filteredListB = cbus.data.episodesCache.filter(function(episode) {
          return episode.id === options.id;
        });

        if (filteredListB.length !== 0) {
          result = filteredListB[0];
        } else { // if still nothing found, try episodesUnsubbed (contains only episodes from unsubscribed podcasts)
          var filteredListC = cbus.data.episodesUnsubbed.filter(function(episode) {
            return episode.id === options.id;
          });

          if (filteredListC.length !== 0) {
            result = filteredListC[0];
          } // else: return null
        }
      }
    } else if (options.audioElement) {
      result = cbus.data.getEpisodeData({
        id: options.audioElement.dataset.id
      });
    } else { // options.index
      result = cbus.data.episodes[Number(options.index)];
    }

    return result;
  }
  return false;
};

cbus.data.getFeedData = function(options) {
  if ((typeof options.index !== "undefined" && options.index !== null)) {
    var data = null;

    data = cbus.data.feeds[options.index];

    return data;
  }

  if ((typeof options.url !== "undefined" && options.url !== null)) {
    // console.log("trying cbus.data.feeds")
    var matches = cbus.data.feeds.filter(function(data) {
      return (data.url === options.url)
    });

    if (matches.length > 0) {
      // console.log(matches)
      return matches[0];
    } else {
      // try again with feedsCache
      // console.log("trying cbus.data.feedsCache")
      var matchesFromCache = cbus.data.feedsCache.filter(function(data) {
        return (data.url === options.url)
      });

      if (matchesFromCache.length > 0) {
        // console.log(matchesFromCache)
        return matchesFromCache[0];
      } else {
        // try again with cbus_feeds_qnp
        // console.log("trying cbus.data.feedsQNP")
        var matchesFromUnsubbedFeeds = cbus.data.feedsQNP.filter(function(data) {
          // console.log(data.url, options.url, data.url === options.url)
          return (data.url === options.url)
        });

        // console.log(matchesFromUnsubbedFeeds, matchesFromUnsubbedFeeds.length)

        if (matchesFromUnsubbedFeeds.length > 0) {
          var matched = matchesFromUnsubbedFeeds[0]
          matched.isUnsubscribed = true
          return matched
        } else {
          return false;
        }
      }
    }
  } else {
    return false;
  }
};

cbus.data.subscribeFeed = function(data, showModal) {
  console.log(data);

  var duplicateFeeds = cbus.data.feeds.filter(function(feed) {
    var pF = parseURL(feed.url);
    var dF = parseURL(data.url);
    return pF.hostname + pF.pathname + pF.search === dF.hostname + dF.pathname + dF.search;
  });

  console.log("duplicate feeds: ", duplicateFeeds);

  if (duplicateFeeds.length === 0) {
    Jimp.read(data.image, function(err, image) {
      if (err) throw err
      image.resize(200, 200).getBuffer(Jimp.AUTO, function(err, imageBuffer) {
        if (err) throw err
        cbus.data.feeds.push({
          image: new Blob([imageBuffer], { type: image.getMIME() }),
          title: data.title,
          url: data.url
        });
        cbus.data.feeds.sort(cbus.const.podcastSort);
        // localStorage.setItem("cbus_feeds", JSON.stringify(cbus.data.feeds));
        localforage.setItem("cbus_feeds", cbus.data.feeds);

        var index;
        for (var i = 0; i < cbus.data.feeds.length; i++) {
          var feed = cbus.data.feeds[i];
          if (feed.url === data.url) {
            index = i;
            break;
          }
        }

        if (typeof index !== "undefined") {
          var feedElem = cbus.data.makeFeedElem(cbus.data.feeds[index], index);
          if (index === 0) {
            if (cbus.data.feeds.length === 1) { // this is our only subscribed podcast
              document.getElementsByClassName("podcasts_feeds--subscribed")[0].appendChild(feedElem)
            } else {
              $(feedElem).insertBefore($(".podcasts_feeds--subscribed .podcasts_feed").eq(0));
            }
          } else {
            $(feedElem).insertAfter($(".podcasts_feeds--subscribed .podcasts_feed").eq(index - 1))
          }
          cbus.broadcast.send("subscribe-success")
          cbus.data.update({
            title: data.title, url: data.url
          });
          $(".podcasts_feeds--subscribed .podcasts_feed").each(function(index, elem) {
            $(elem).attr("data-index", index);
          });

          if (showModal) {
            cbus.ui.showSnackbar(`Subscribed to ‘${data.title}’.`);
          }
        }
      });
    });
  } else if (showModal) {
    cbus.ui.showSnackbar(`You are already subscribed to ‘${data.title}’.`);
  }
};

cbus.data.unsubscribeFeed = function(options, showModal) {
  var feedExists;
  var feedIndex;

  var key = Object.keys(options).filter(function(key) {
    return key === "url";
  })[0];

  if (key) {
    for (var i = cbus.data.feeds.length - 1; i >= 0; i--) {
      var feed = cbus.data.feeds[i];
      if (feed[key] === options[key]) {
        feedExists = true;
        feedIndex = i;
        break;
      }
    }

    if (feedExists) {
      cbus.data.feeds.splice(feedIndex, 1);
      // localStorage.setItem("cbus_feeds", JSON.stringify(cbus.data.feeds));
      localforage.setItem("cbus_feeds", cbus.data.feeds);

      $(".podcasts_feeds--subscribed .podcasts_feed").eq(feedIndex).remove();
      $(".podcasts_feeds--subscribed .podcasts_feed").each(function(index, elem) {
        $(elem).attr("data-index", index);
      });

      if (showModal) {
        var query = {};
        query[key] = options[key];

        var data = arrayFindByKey(cbus.data.feedsCache, query)[0];
        cbus.ui.showSnackbar(`Unsubscribed from ‘${data.title}’.`, null, [
          {
            text: "Undo",
            onClick: function() {
              cbus.broadcast.send("toggleSubscribe", {
                direction: 1,
                url: data.url
              });
            }
          }
        ]);
      }
    } else {
      return false;
    }
  }
  return false;
};

cbus.data.syncOffline = function() {
  // localStorage.setItem("cbus_feeds", JSON.stringify(cbus.data.feeds));
  // localStorage.setItem("cbus_cache_episodes", JSON.stringify(cbus.data.episodes));
  localforage.setItem("cbus_feeds", cbus.data.feeds);
  localforage.setItem("cbus_cache_episodes", cbus.data.episodes);
  localforage.setItem("cbus_episodes_offline", cbus.data.episodesOffline);
  console.log("syncOffline")
};

cbus.data.feedIsSubscribed = function(options) {
  if (options.url) {
    var podcastsMatchingUrl = cbus.data.feeds.filter(function(feed) {
      return feed.url == options.url;
    });
    if (podcastsMatchingUrl.length > 0) {
      return true;
    } else {
      return false;
    }
  }
  return false;
};

cbus.data.makeFeedElem = function(data, index, isSearchResult, isExplore) {
  var elem = document.createElement("div");

  if (isSearchResult || isExplore) {
    elem.classList.add("explore_feed", "tooltip--podcast");
  } else {
    elem.classList.add("podcasts_feed", "tooltip--podcast");
  }

  elem.dataset.index = index;

  var tooltipContent, tooltipFunctionReady;

  if (isSearchResult) {
    elem.dataset.title = data.title;
    elem.dataset.url = data.url;
    elem.dataset.image = data.image;
    elem.dataset.url = data.url;
    elem.style.backgroundImage = `url( ${data.image} )`;

    tooltipContent = $("<span>" + data.title + "</span><span class='podcasts_control podcasts_control--subscribe material-icons md-18'>add</span>");

    tooltipFunctionReady = function(origin, tooltip) {
      var subscribeButton = tooltip[0].querySelector(".podcasts_control--subscribe");
      subscribeButton.onclick = function() {
        var resultElem = origin[0];
        var feedData = {
          title: resultElem.dataset.title,
          url: resultElem.dataset.url,
          image: resultElem.dataset.image
        };

        cbus.data.subscribeFeed(feedData, true);
      };
    };
  } else {
    elem.style.backgroundImage = `url( ${ URL.createObjectURL(data.image) } )`;

    tooltipContent = $("<span>" + data.title + "</span><span class='podcasts_control podcasts_control--unsubscribe material-icons md-18'>delete</span>");

    tooltipFunctionReady = function(origin, tooltip) {
      var deleteButton = tooltip[0].querySelector(".podcasts_control--unsubscribe");
      deleteButton.onclick = function() {
        var feedData = cbus.data.getFeedData({
          index: Number(origin[0].dataset.index)
        });

        cbus.data.unsubscribeFeed({ url: feedData.url }, true);
      };
    };
  }

  $(elem).tooltipster({
    theme: "tooltipster-cbus",
    animation: "fadeup",
    speed: 300,
    interactive: true,
    content: tooltipContent,
    functionReady: tooltipFunctionReady
  });

  $(elem).on("click", function() {
    var url;
    if (this.dataset.url) {
      url = this.dataset.url;
    } else {
      var data = cbus.data.getFeedData({
        index: $(".podcasts_feeds--subscribed .podcasts_feed").index($(this))
      });
      url = data.url;
    }
    cbus.broadcast.send("showPodcastDetail", {
      url: url
    });
  });

  return elem;
};

cbus.data.downloadEpisode = function(audioElem) {
  let episodeData = cbus.data.getEpisodeData({ audioElement: audioElem });
  let feedData = cbus.data.getFeedData({ url: episodeData.feedURL });
  let audioURL = episodeData.url;

  let storageFilePath = path.join(
    cbus.data.OFFLINE_STORAGE_DIR, sha1(audioURL)
  );

  if (
    cbus.data.episodesOffline.indexOf(audioURL) === -1 &&
    cbus.data.episodesDownloading.indexOf(audioURL) === -1
  ) { // not downloaded and not already downloading, so download it now
    if (!fs.existsSync(cbus.data.OFFLINE_STORAGE_DIR)) {
      fs.mkdirSync(cbus.data.OFFLINE_STORAGE_DIR);
    }
    fs.closeSync(fs.openSync(storageFilePath, "a")); // create empty file

    let writeStream = fs.createWriteStream(storageFilePath);

    cbus.ui.showSnackbar(`Starting download of '${feedData.title}: ${episodeData.title}'`);

    writeStream.on("finish", function() {
      cbus.data.episodesOffline.push(audioURL);

      let episodesDownloadingIndex = cbus.data.episodesDownloading.indexOf(audioURL);
      if (episodesDownloadingIndex !== -1) {
        cbus.data.episodesDownloading.splice(episodesDownloadingIndex, 1);
      }

      cbus.data.syncOffline();

      cbus.ui.showSnackbar(`'${feedData.title}: ${episodeData.title}' is now available offline.`);

      cbus.broadcast.send("offline_episodes_changed", {
        episodeURL: audioURL
      });
    });

    require("request")(audioURL).pipe(writeStream);
    cbus.data.episodesDownloading.push(audioURL);
  } else if (cbus.data.episodesDownloading.indexOf(audioURL) === -1) { // downloaded, so remove download
    fs.unlink(storageFilePath, function(err) {
      if (err) {
        remote.dialog.showErrorBox("Error removing downloaded episode", "Cumulonimbus could not remove the downloaded episode file. Please try again or manually go to Cumulonimbus's user data directory, delete the file manually, and restart Cumulonimbus. Sorry about this.");
      } else {
        let index = cbus.data.episodesOffline.indexOf(audioURL);
        cbus.data.episodesOffline.splice(index, 1);
        cbus.data.syncOffline();
        cbus.ui.showSnackbar(
          `'${feedData.title}: ${episodeData.title}' is no longer available offline.`
        )
        cbus.broadcast.send("offline_episodes_changed", {
          episodeURL: audioURL
        });
      }
    })
  }
};

cbus.data.getEpisodeProgress = function(id) {
  let result = {
    time: null, completed: false
  };
  if (cbus.data.episodeProgresses.hasOwnProperty(id)) {
    result.time = cbus.data.episodeProgresses[id];
  }
  if (cbus.data.episodeCompletedStatuses.hasOwnProperty(id)) {
    result.completed = cbus.data.episodeCompletedStatuses[id];
  }
  return result;
};

cbus.data.toggleCompleted = function(episodeID, direction) {
  if (typeof direction === "boolean") {
    cbus.data.episodeCompletedStatuses[episodeID] = direction;
  } else {
    cbus.data.episodeCompletedStatuses[episodeID] = !cbus.data.episodeCompletedStatuses[episodeID];
  }
  localforage.setItem("cbus_episode_completed_statuses", cbus.data.episodeCompletedStatuses);
  cbus.broadcast.send("episode_completed_status_change", {
    id: episodeID,
    completed: cbus.data.episodeCompletedStatuses[episodeID]
  });
};

/* moving parts */

cbus.broadcast.listen("showPodcastDetail", function(e) {
  cbus.data.state.podcastDetailCurrentData = {
    url: null
  };

  console.log(e.data.url)

  function startServerUpdate() {
    cbus.server.update([feedData], function(json) {
      var feed = cbus.data.feedsCache.filter(function(feed) {
        return feed.url === Object.keys(json)[0];
      })[0];
      console.log(json)
      var episodes = json[Object.keys(json)[0]].items;

      for (episode of episodes) {
        episode.feedURL = Object.keys(json)[0];
        cbus.data.episodesCache.push(episode);

        // create and append audio elements
        var audioElem = document.createElement("audio");
        audioElem.src = episode.url;
        audioElem.dataset.id = episode.id;
        audioElem.preload = "none";
        $(".audios").append(audioElem);
      }

      cbus.broadcast.send("gotPodcastEpisodes", {
        episodes: episodes
      });
    });
  }

  var feedData = cbus.data.getFeedData({ url: e.data.url });
  if (feedData) {
    startServerUpdate();
  } else {
    cbus.broadcast.listen("gotPodcastData", function(f) {
      if (f.data.url === e.data.url) {
        feedData = {
          title: f.data.title,
          url: f.data.url
        };
        startServerUpdate();
      }
    });
  }

  cbus.server.getPodcastInfo(e.data.url, function(data) {
    data.url = e.data.url;
    console.log("getPodcastInfo", data)
    cbus.broadcast.send("gotPodcastData", data);
  });

  cbus.data.state.podcastDetailCurrentData = {
    url: e.data.url
  };
});

cbus.broadcast.listen("makeFeedsBackup", function(e) {
  localforage.getItem("cbus_feeds").then(function(r) {
    cbus.server.generateOPML(r);
  });
});

cbus.broadcast.listen("startFeedsImport", function(e) {
  remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
    title: "Import subscriptions",
    filters: [
      { name:"OPML and XML files", extensions: ["opml", "xml"] },
      { name: "All files", extensions: ["*"] }
    ],
    message: "Select the OPML file to import from"
  }, function(filePaths) {
    fs.readFile(filePaths[0], "utf8", function(err, opmlRaw) {
      let parser = new DOMParser();
      opml = parser.parseFromString(opmlRaw, "text/xml");
      let outlines = opml.querySelectorAll("body outline[type=rss][xmlUrl]");
      for (let outline of outlines) {
        let url = outline.getAttribute("xmlUrl");
        // we have title and url, need to find image. getPodcastInfo.js to the rescue!
        cbus.server.getPodcastInfo(url, function(feedData) {
          if (feedData) {
            cbus.data.subscribeFeed({
              url: url,
              title: feedData.title,
              image: feedData.image
            }, true);
          }
        });
      }
      remote.dialog.showMessageBox(remote.getCurrentWindow(), {
        message: "Subscriptions now importing. May take time to gather all necessary information."
      });
    })
  });
});

// cbus.broadcast.send("makeFeedsBackup");

// cbus.broadcast.listen("removeDuplicateFeeds", function(e) {
//   var duplicateFeeds = [];
//
//   for (feed of cbus.data.feeds) {
//     for (var i = 0; i < cbus.data.feeds.length; i++) {
//       var comparingFeed = cbus.data.feeds[i];
//
//       var pF = parseURL(feed.url);
//       var dF = parseURL(comparingFeed.url);
//
//       if (
//         pF.hostname + pF.pathname + pF.search === dF.hostname + dF.pathname + dF.search &&
//         feed !== comparingFeed
//       ) {
//         console.log("found duplicate", feed, comparingFeed);
//         cbus.data.feeds.splice(i, 1);
//         cbus.ui.showSnackbar(`Removed duplicate of ‘${feed.title}’.`);
//       }
//     }
//   }
//
//   cbus.ui.showSnackbar("Done checking for duplicate feeds.");
// });

cbus.broadcast.listen("updateFeedArtworks", function() {
  for (var i = 0; i < cbus.data.feeds.length; i++) {
    let feed = cbus.data.feeds[i];

    cbus.server.getPodcastInfo(feed.url, function(body) {
      var feedData = cbus.data.getFeedData({
        url: feed.url
      });

      if (body.image) {
        var img = document.createElement("img");
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");

        img.addEventListener("load", function() {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(function(imageBlob) {
            feedData.image = imageBlob;
            cbus.data.syncOffline();
            cbus.ui.showSnackbar(`Updated artwork for ‘${feed.title}’.`);
          });
        });

        img.src = body.image;
      } else {
        console.log(feed.title + " FAIL");
        cbus.ui.showSnackbar(`Error updating artwork for ‘${feed.title}’.`, "warning");
      }
    });
  }
});

cbus.broadcast.listen("queueChanged", function() {
  localforage.setItem("cbus-last-queue-urls", cbus.audio.queue.map(elem => elem.src));

  localforage.getItem("cbus_feeds_qnp").then(function(feedsQNP) {
    if (!feedsQNP) { feedsQNP = [] }
    for (let elem of cbus.audio.queue) {
      var thisPodcast = cbus.data.getFeedData({
        url: cbus.data.getEpisodeData({ audioElement: elem }).feedURL
      });
      feedsQNP.push(thisPodcast);
    }
    localforage.setItem("cbus_feeds_qnp", feedsQNP);
  });

  localforage.setItem("cbus-last-queue-infos", cbus.audio.queue.map(elem => {
    return cbus.data.getEpisodeData({ audioElement: elem })
  }))
});

cbus.broadcast.listen("audioChange", function() {
  var currentAudioInfo = cbus.data.getEpisodeData({ audioElement: cbus.audio.element })
  localforage.setItem("cbus-last-audio-info", currentAudioInfo)

  localforage.getItem("cbus_feeds_qnp").then(function(feedsQNP) {
    var thisPodcast = cbus.data.getFeedData({
      url: cbus.data.getEpisodeData({ audioElement: cbus.audio.element }).feedURL
    });
    if (feedsQNP) {
      feedsQNP.push(thisPodcast);
    } else {
      feedsQNP = [thisPodcast];
    }
    localforage.setItem("cbus_feeds_qnp", feedsQNP);
  });
});

cbus.broadcast.listen("offline_episodes_changed", function(info) {
  let episodeURL = info.data.episodeURL;
  let audioElem = document.querySelector(`.audios audio[data-id="${episodeURL}"]`)
  if (audioElem) {
    if (cbus.data.episodesOffline.indexOf(episodeURL) !== -1) { // added to offline episodes
      let storageFilePath = path.join(
        cbus.data.OFFLINE_STORAGE_DIR, sha1(episodeURL)
      );
      fs.readFile(storageFilePath, function(err, buffer) {
        let blob = new Blob([ buffer ]);
        audioElem.src = URL.createObjectURL(blob);
      });
    } else { // removed from offline episodes
      if (audioElem === cbus.audio.element) { // if currently being played
        cbus.audio.pause();
        let currentTime = audioElem.currentTime;
        audioElem.src = episodeURL;
        audioElem.currentTime = currentTime;
      } else {
        audioElem.src = episodeURL;
      }
    }
  }
});

cbus.broadcast.listen("audioTick", function(e) {
  // e.data.currentTime, e.data.duration
  if (Math.floor(e.data.currentTime) % 5 === 0) { // update every 5 seconds to reduce load
    /* save progress */
    let episodeID = cbus.audio.element.dataset.id;
    cbus.data.episodeProgresses[episodeID] = Math.max(
      e.data.currentTime, (cbus.data.episodeProgresses[episodeID] || 0)
    );
    localforage.setItem("cbus_episode_progresses", cbus.data.episodeProgresses);
    /* keep track of completed status */
    if (e.data.duration - e.data.currentTime < 30) {
      cbus.data.toggleCompleted(episodeID, true);
    }
  }
});
