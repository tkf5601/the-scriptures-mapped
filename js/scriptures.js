/*global window*/
/*jslint browser: true*/

let showLocation;
showLocation = function (geotagId, placename, latitude, longitude, viewLatitude, viewLongitude, viewTilt, viewRoll, viewAltitude, viewHeading) {
    Scriptures.showLocation(geotagId, placename, latitude, longitude, viewLatitude, viewLongitude, viewTilt, viewRoll, viewAltitude, viewHeading);
};

const Scriptures = (function () {
    "use strict";
    // ------------------------------------------------------------------------------------------------------
    //                                      CONSTANTS
    //
    const LAT_LON_PARSER = /\((.*),'(.*)',(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*)\)/;
    const MAX_RETRY_DELAY = 5000;
    const SCRIPTURES_URL = "http://scriptures.byu.edu/mapscrip/mapgetscrip.php";

    //------------------------------------------------------------------------------------------------------
    //                              PRIVATE VARIABLES
    //
    let books = {};
    let gmMarkers = [];
    let requestedBreadcrumbs;
    let retryDelay = 500;
    let volumes = [];

    //------------------------------------------------------------------------------------------------------
    //                  PRIVATE METHOD DECLARATIONS
    //
    let addMarker;
    let ajax;
    let bookChapterValid;
    let breadcrumbs;
    let cacheBooks;
    let clearMarkers;
    let encodedScriptureUrlParameters;
    let getScriptureCallback;
    let getScriptureFailed;
    let hash;
    let init;
    let navigateBook;
    let navigateChapter;
    let navigateHome;
    let nextChapter;
    let onHashChanged;
    let previousChapter;
    let setupMarkers;
    // let showLocation;
    let titleForBookChapter;

    //------------------------------------------------------------------------------------------------------
    //                              PRIVATE METHODS
    //
    addMarker = function (placename, latitude, longitude) {
        //NEEDSWORK Chck to see if we already have a marker at this lat/long
        // If so, merge the placename
        let marker = new google.maps.Marker({
            position: {lat: latitude, lng: longitude},
            map: map,
            title: placename,
            animation: google.maps.Animation.DROP
        });

        let contentString = placename;

        let infowindow = new google.maps.InfoWindow({
            content: contentString,
            position: new google.maps.LatLng(latitude,longitude)
        });

        gmMarkers.push(marker);

        infowindow.open(map, marker);

        return marker;
    };

    ajax = function (url, successCallback, failureCallback, skipParse) {
        let request = new XMLHttpRequest();
        request.open("GET", url, true);

        request.onload = function () {
            if (request.status >= 200 && request.status < 400) {
                let data;

                if (skipParse) {
                    data = request.responseText;
                } else {
                    data = JSON.parse(request.responseText);
                }

                if (typeof successCallback === "function") {
                    successCallback(data);
                }
            } else {
                if (typeof failureCallback === "function") {
                    failureCallback(request);
                }
            }
        };
        request.onerror = failureCallback;
        request.send();
    };



    bookChapterValid = function (bookId, chapter) {
        let book = books[bookId];

        if (book === undefined || chapter < 0 || chapter > book.numChapters) {
            return false;
        }

        if (chapter === 0 && book.numChapters > 0) {
            return false;
        }

        return true;
    };



    breadcrumbs = function (volume, book, chapter) {
        let crumbs;

        if (volume === undefined) {
            crumbs = "<ul><li>The Scriptures</li>";
        } else {
            crumbs = "<ul><li><a href=\"javascript:void(0);\" " + "onclick=\"Scriptures.hash()\">The Scriptures</a></li>";

            if (book === undefined) {
                crumbs += "<li>" + volume.fullName + "</li>";
            } else {
                crumbs += "<li><a href=\"javascript:void(0);\" " + "onclick=\"Scriptures.hash(" + volume.id + ")\">" + volume.fullName + "</a></li>";

                if (chapter === undefined || chapter <= 0) {
                    crumbs += "<li>" + book.tocName + "</li>";
                } else {
                    crumbs += "<li><a href=\"javascript:void(0);\" " + "onclick=\"Scriptures.hash(0, " + book.id + ")\">" + book.tocName + "</a></li>";
                    crumbs += "<li>" + chapter + "</li>";
                }
            }
        }

        return crumbs + "</ul>";
    };



    cacheBooks = function (callback) {
        volumes.forEach(function (volume) {
            let volumeBooks = [];
            let bookId = volume.minBookId;

            while (bookId <= volume.maxBookId) {
                volumeBooks.push(books[bookId]);
                bookId += 1;
            }
            volume.books = volumeBooks;
        });

        if (typeof callback === "function") {
            callback();
        }
    };



    clearMarkers = function () {
        gmMarkers.forEach(function (marker) {
            marker.setMap(null);
        });

        gmMarkers = [];
    };



    encodedScriptureUrlParameters = function (bookId, chapter, verses, isJst) {
        // $('#scriptures').hide();
        let options = "";

        if (bookId !== undefined && chapter !== undefined) {
            if (verses !== undefined) {
                options += verses;
            }
            if (isJst !== undefined && isJst) {
                options += "&jst=JST";
            }
            // $('#scriptures').fadeIn(500);
            return SCRIPTURES_URL + "?book=" + bookId + "&chap=" + chapter + "&verses" + options;
        }
    };



    getScriptureCallback = function (chapterHtml) {
        document.getElementById("scriptures").innerHTML = chapterHtml;
        clearMarkers();
        setupMarkers();
        document.getElementById("crumb").innerHTML = requestedBreadcrumbs;
        clearMarkers();
        setupMarkers();
    };



    getScriptureFailed = function () {
        console.log("Warning: scripture request from server failed");
    };



    hash = function (volumeId, bookId, chapter) {
        let newHash = "";

        if (volumeId !== undefined) {
            newHash += volumeId;

            if (bookId !== undefined) {
                newHash += ":" + bookId;

                if (chapter !== undefined) {
                    newHash += ":" + chapter;
                }
            }
        }

        location.hash = newHash;
    };



    init = function (callback) {
        let booksLoaded = false;
        let volumesLoaded = false;

        ajax(
            "http://scriptures.byu.edu/mapscrip/model/books.php",
            function (data) {
                books = data;
                booksLoaded = true;

                if (volumesLoaded) {
                    cacheBooks(callback);
                }
            }
        );
        ajax(
            "http://scriptures.byu.edu/mapscrip/model/volumes.php",
            function (data) {
                volumes = data;
                volumesLoaded = true;

                if (booksLoaded) {
                    cacheBooks(callback);
                }
            }
        );
    };



    navigateBook = function (bookId) {
        $('#scriptures').hide();
        document.getElementById("scriptures").innerHTML = "<div>" + bookId + "</div>";

        document.getElementById("navbtns").innerHTML = "";

        if (bookId !== undefined) {
            let book = books[bookId];
            let volume = volumes[book.parentBookId - 1];

            if (book.numChapters === 0) {
                navigateChapter(bookId, 0);

            } else if (book.numChapters === 1) {
                navigateChapter(bookId, 1);

            } else {
                let html = "<div id=\"scripnav\"><div class=\"volume\"><h5>" + book.fullName + "</h5></div><div id=\"makeChaptersLookNice\">";

                for(var i = 0; i < book.numChapters; i++) {
                    html += "<a class=\"btn chapter\" id=\"" + (i + 1) + "\" href=\"#0:" + bookId + ":" + (i+1) + "\">" + (i+1) + "</a>";
                }

                html += "</div></div>";
                document.getElementById("scriptures").innerHTML = html;
                $('#scriptures').fadeIn(500);
                document.getElementById("crumb").innerHTML = breadcrumbs(volume, book);

            }
        }
        /*
        NEEDSWORK: generate HTML that looks like this to use Liddle's styles

        <div id="scripnav">
            <div class="volume"><h5>book.fullName</h5></div>
            <a class="btn chapter" id="1" href="#0:bookId:1">1</a>
            <a class="btn chapter" id="2" href="#0:bookId:2">2</a>
            ...
            <a class="btn chapter" id="49" href="#0:bookId:49">49</a>
            <a class="btn chapter" id="50" href="#0:bookId:50">50</a>
        </div>

        (plug in the right strings for book.fullName and bookId in the example above)

        Logic for this method:
        1. Get the book for the given bookId
        2. If the book has no numbered chapters, call navigateChapter() for that book id and chapter 0
        3. else if the book has exacly one chapter, call navigateChapter() for that book id and chapter 1
        4. else generate the html to match the example above
        */
    };



    navigateChapter = function (bookId, chapter) {
        let html;

        if (bookId !== undefined) {
            let book = books[bookId];
            let volume = volumes[book.parentBookId - 1];
            requestedBreadcrumbs = breadcrumbs(volume, book, chapter);




            //NEEDSWORK: this is great place to insert next/prev nav buttons

            html = "<button id=\"prev_button\" href=\"javascript:void(0);\">Prev</button> <button id=\"next_button\" href=\"javascript:void(0);\">Next</button>"

            document.getElementById("navbtns").innerHTML = html;

            document.getElementById("next_button").addEventListener("click", function() {
                let next = nextChapter(bookId, chapter);
                Scriptures.hash(next[0], next[1], next[2]);
            });

            document.getElementById("prev_button").addEventListener("click", function() {
                let prev = previousChapter(bookId, chapter);
                Scriptures.hash(prev[0], prev[1], prev[2]);
            });


            //NEEDSWORK: this is great place to insert next/prev nav buttons




            ajax(
                encodedScriptureUrlParameters(bookId, chapter),
                getScriptureCallback,
                getScriptureFailed,
                true
            );
        }
    };



    navigateHome = function (volumeId) {
        $('#scriptures').hide();
        let displayedVolume;
        let navContents = "<div id=\"scriptnav\">";

        document.getElementById("navbtns").innerHTML = "";

        volumes.forEach(function (volume) {
            if (volumeId === undefined || volume.id === volumeId) {
                navContents += "<div class=\"volume\"><a name=\"v" + volume.id + "\" /><h5>" + volume.fullName + "</h5></div><div class=\"books\">";

                volume.books.forEach(function (book) {
                    navContents += "<a class=\"btn\" id=\"" + book.id + "\" href=\"#" + volume.id + ":" + book.id + "\">" + book.gridName + "</a>";
                });
                navContents += "</div>";

                if (volume.id === volumeId) {
                    displayedVolume = volume;
                }
            }
        });
        navContents += "<br /><br /></div>";



        document.getElementById("scriptures").innerHTML = navContents;
        $('#scriptures').fadeIn(500);

        document.getElementById("crumb").innerHTML = breadcrumbs(displayedVolume);
    };



    nextChapter = function (bookId, chapter) {
        nextSlide();
        let book = books[bookId];
        let volume = volumes[book.parentBookId - 1];

        if (book !== undefined) {
            if (chapter < book.numChapters) {
                // return [bookId, chapter + 1, titleForBookChapter(book, chapter + 1)];
                return [volume.id, bookId, chapter+1];
            }

            let nextBook = books[bookId + 1];
            if (nextBook !== undefined) {

                let nextChapterValue = 0;

                if (nextBook.numChapters > 0) {
                    nextChapterValue = 1;
                }
                // return [nextBook.id, nextChapterValue, titleForBookChapter(nextBook, nextChapterValue)];
                return [volume.id, nextBook.id, nextChapterValue];
            }
        }
    };



    function nextSlide() {
        // $("#scriptures").animate({ left: -$("#scriptures").width() });
        // $("#scriptures").animate({ left:  $("#scriptures").width()});

        $("#scriptures").animate({ left: -$("#scriptures").width() });
        $("#scriptures").fadeTo(1, 0);
        $("#scriptures").animate( {left:  $("#scriptures").width()}, {duration: 1});
        $("#scriptures").fadeTo(1, 1);
        $("#scriptures").animate({ left: -($("#scriptures").width()-$("#scriptures").width()) });
    };



    onHashChanged = function () {
        let bookId;
        let chapter;
        let ids = [];
        let volumeId;

        if (location.hash !== "" && location.hash.length > 1) {
            // Remove leading # and split the string on colon delimiters
            ids = location.hash.substring(1).split(":");
        }
        if (ids.length <= 0) {
            navigateHome();
        } else if (ids.length === 1) {
            //Display single volume's table of contents
            volumeId = Number(ids[0]);

            if (volumeId < volumes[0].id || volumeId > volumes[volumes.length - 1].id) {
                navigateHome();
            } else {
                navigateHome(volumeId);
            }
        } else if (ids.length === 2) {
            // NEEDSWORK: display book's list of chapters
            bookId = Number(ids[1]);

            if (books[bookId] === undefined) {
                navigateHome();
            } else {
                navigateBook(bookId);
            }
        } else {
            //display chapter contents
            bookId = Number(ids[1]);
            chapter = Number(ids[2]);

            if (!bookChapterValid(bookId, chapter)) {
                navigateHome();
            } else {
                navigateChapter(bookId, chapter);
            }
        }
    };



    previousChapter = function (bookId, chapter) {
        previousSlide();
        /*
        Get the book for the given bookid. if its not undefined:
            if chapter > 1, its the easy case, just return the same bookid
                chapter - 1, and the title string for that book/chapter combo
            otherwise we need to see if theres a previous book:
                get the book for the bookId - 1. if its not undefined:
                    return bookId - 1, the last chapter of that book and the title string for that book/chapter combo
        If we didnt already return a 3-element array of bookId/chapter/title at this point just drop through the bottom of the function. we'll return undevined by default meaning there is no previous chapter
        */
        let book = books[bookId];
        let volume = volumes[book.parentBookId - 1];

        if (book !== undefined) {

            if (chapter > 1) {
                // return [bookId, chapter - 1, titleForBookChapter(book, chapter - 1)];
                return [volume.id, bookId, chapter - 1];
            }

            let prevBook = books[bookId - 1];
            if (prevBook !== undefined) {

                let prevChapterValue = prevBook.numChapters;

                // return [prevBook.id, prevChapterValue, titleForBookChapter(prevBook, prevChapterValue)];
                return [volume.id, prevBook.id, prevChapterValue];
            }
        }
    };



    function previousSlide() {
        $("#scriptures").animate({ left: $("#scriptures").width() });
        $("#scriptures").fadeTo(1, 0);
        $("#scriptures").animate( {left:  -$("#scriptures").width()}, {duration: 1});
        $("#scriptures").fadeTo(1, 1);
        $("#scriptures").animate({ left: $("#scriptures").width()-$("#scriptures").width() });
    };



    setupMarkers = function () {
        if (window.google === undefined) {
            let retryId = window.setTimeout(setupMarkers, retryDelay);

            retryDelay += retryDelay;

            if (retryDelay > MAX_RETRY_DELAY) {
                window.clearTimeout(retryId);
            }
            return;
        }

        if (gmMarkers.length > 0) {
            clearMarkers();
        }

        let matches;
        let mark;

        document.querySelectorAll("a[onclick^=\"showLocation(\"]").forEach(function (element) {
            let value = element.getAttribute("onclick");

            matches = LAT_LON_PARSER.exec(value);

            if (matches) {
                let placename = matches[2];
                let latitude = Number(matches[3]);
                let longitude = Number(matches[4]);
                let flag = matches[11].substring(1);

                flag = flag.substring(0, flag.length - 1);
                // if (flag !== "") {
                //     placename += " " + flag;
                // }

                mark = addMarker(placename, latitude, longitude);
            }
        });

        console.log(gmMarkers.length);
        if(gmMarkers.length === 0) {

        }
        if(gmMarkers.length === 1) {
            map.setZoom(8);
            map.panTo(mark.position);
        }
        else if (gmMarkers.length > 1){
            let bounds = new google.maps.LatLngBounds();
            for (var i = 0; i < gmMarkers.length; i++) {
                bounds.extend(gmMarkers[i].getPosition());
            }
            map.fitBounds(bounds);
        }
    };



    showLocation = function (geotagId, placename, latitude, longitude, viewLatitude, viewLongitude, viewTilt, viewRoll, viewAltitude, viewHeading) {
        let center = new google.maps.LatLng(latitude, longitude);

        // using global variable:
        map.panTo(center);
        map.setZoom(12);
    };



    titleForBookChapter = function (book, chapter) {
        return book.tocName + (chapter > 0
            ? " " + chapter
            : "");
    };

    //------------------------------------------------------------------------------------------------------
    //                                      PUBLIC API
    //
    return {
        hash: hash,
        init(callback) {
            init(callback);
        },
        showLocation(geotagId, placename, latitude, longitude, viewLatitude, viewLongitude, viewTilt, viewRoll, viewAltitude, viewHeading) {
            showLocation(geotagId, placename, latitude, longitude, viewLatitude, viewLongitude, viewTilt, viewRoll, viewAltitude, viewHeading);
        },
        nextChapter (bookId, chapter) {
            nextChapter(bookId, chapter);
        },
        onHashChanged(eventHandler) {
            onHashChanged(eventHandler);
        },
        previousChapter (bookId, chapter) {
            previousChapter(bookId, chapter);
        }
    };
}());
