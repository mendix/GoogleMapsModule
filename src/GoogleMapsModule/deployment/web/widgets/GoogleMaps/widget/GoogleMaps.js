/*global google */

define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/dom-style",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/text!GoogleMaps/widget/template/GoogleMaps.html",
    "GoogleMaps/lib/jsapi"
], function (declare, _WidgetBase, _TemplatedMixin, domStyle, domConstruct, dojoArray, lang, widgetTemplate) {
    "use strict";

    return declare("GoogleMaps.widget.GoogleMaps", [_WidgetBase, _TemplatedMixin], {
        templateString: widgetTemplate,

        _handle: null,
        _contextObj: null,
        _googleMap: null,
        _markerCache: null,
        _googleScript: null,
        _defaultPosition: null,

        _progressID: null,

        _latlngObjs: [],
        _resizeTimer: null,

        postCreate: function () {
            logger.debug(this.id + ".postCreate");
        },

        update: function (obj, callback) {
            logger.debug(this.id + ".update");
            this._contextObj = obj;
            this._resetSubscriptions();

            if (!google) {
                console.warn("Google JSAPI is not loaded, exiting!");
                callback();
                return;
            }

            if (!google.maps) {
                logger.debug(this.id + ".update load Google maps");
                var params = (this.apiAccessKey !== "") ? "key=" + this.apiAccessKey : "";
                if (google.loader && google.loader.Secure === false) {
                    google.loader.Secure = true;
                }
                window._googleMapsLoading = true;
                google.load("maps", 3, {
                    other_params: params,
                    callback: lang.hitch(this, function () {
                        logger.debug(this.id + ".update load Google maps callback");
                        window._googleMapsLoading = false;
                        this._loadMap(callback);
                    })
                });
            } else {
                if (this._googleMap) {
                    logger.debug(this.id + ".update has _googleMap");
                    this._fetchMarkers(callback);
                    google.maps.event.trigger(this._googleMap, "resize");
                } else {
                    logger.debug(this.id + ".update has no _googleMap");
                    if (window._googleMapsLoading) {
                        this._waitForGoogleLoad(callback);
                    } else {
                        this._loadMap(callback);
                    }
                }
            }
        },

        resize: function (box) {
            if (this._googleMap) {
                if (this._resizeTimer) {
                    clearTimeout(this._resizeTimer);
                }
                this._resizeTimer = setTimeout(lang.hitch(this, function () {
                    logger.debug(this.id + ".resize");
                    google.maps.event.trigger(this._googleMap, "resize");
                    if (this.gotocontext) {
                        this._goToContext();
                    }
                }), 250);
            }
        },

        _waitForGoogleLoad: function (callback) {
            logger.debug(this.id + "._waitForGoogleLoad");
            var interval = null,
                i = 0,
                timeout = 5000; // We'll timeout if google maps is not loaded
            var intervalFunc = lang.hitch(this, function () {
                i++;
                if (i > timeout) {
                    logger.warn(this.id + "._waitForGoogleLoad: it seems Google Maps is not loaded in the other widget. Quitting");
                    this._executeCallback(callback);
                    clearInterval(interval);
                }
                if (!window._googleMapsLoading) {
                    this._loadMap(callback);
                    clearInterval(interval);
                }
            });
            interval = setInterval(intervalFunc, 1);
        },

        _resetSubscriptions: function () {
            logger.debug(this.id + "._resetSubscriptions");

            if (this._handle) {
                logger.debug(this.id + "._resetSubscriptions unsubscribe");
                mx.data.unsubscribe(this._handle);
                this._handle = null;
            }

            if (this._contextObj) {
                logger.debug(this.id + "._resetSubscriptions subscribe", this._contextObj.getGuid());
                this._handle = mx.data.subscribe({
                    guid: this._contextObj.getGuid(),
                    callback: lang.hitch(this, function (guid) {
                        this._fetchMarkers();
                    })
                });
            }
            else {
                this._handle = mx.data.subscribe({
                    entity: this.mapEntity,
                    callback: lang.hitch(this, function (entity) {
                        this._fetchMarkers();
                    })
                });

            }
        },

        _loadMap: function (callback) {
            logger.debug(this.id + "._loadMap");
            domStyle.set(this.mapContainer, {
                height: this.mapHeight + "px",
                width: this.mapWidth
            });

            this._defaultPosition = new google.maps.LatLng(this.defaultLat, this.defaultLng);

            var mapOptions = {
                zoom: 11,
                draggable: this.opt_drag,
                scrollwheel: this.opt_scroll,
                center: this._defaultPosition,
                mapTypeId: google.maps.MapTypeId[this.defaultMapType] || google.maps.MapTypeId.ROADMAP,
                mapTypeControl: this.opt_mapcontrol,
                mapTypeControlOption: {
                    style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR
                },
                streetViewControl: this.opt_streetview,
                zoomControl: this.opt_zoomcontrol,
                tilt: parseInt(this.opt_tilt.replace("d", ""), 10)
            };
            if (this.styleArray !== ""){
                mapOptions.styles = JSON.parse(this.styleArray);
            }

            this._googleMap = new google.maps.Map(this.mapContainer, mapOptions);

            this._fetchMarkers();

            this._executeCallback(callback);
        },

        _fetchMarkers: function (callback) {
            logger.debug(this.id + "._fetchMarkers");
            if (this.gotocontext) {
                this._goToContext(callback);
            } else {
                if (this.updateRefresh) {
                    this._fetchFromDB(callback);
                } else {
                    if (this._markerCache) {
                        this._fetchFromCache(callback);
                    } else {
                        this._fetchFromDB(callback);
                    }
                }
            }
        },

        _refreshMap: function (objs, callback) {
            logger.debug(this.id + "._refreshMap");
            var bounds = new google.maps.LatLngBounds(),
                panPosition = this._defaultPosition,
                validCount = 0;

            if (this.showProgress) {
                this._progressID = mx.ui.showProgress(this.progressMessage);
            }

            this._createLatLngObjs(objs, [], lang.hitch(this, function (latlngObjs) {

                if (this._progressID) {
                    mx.ui.hideProgress(this._progressID);
                    this._progressID = null;
                }

                this._latlngObjs = latlngObjs;

                dojoArray.forEach(this._latlngObjs, lang.hitch(this, function (obj) {
                    this._addMarker(obj);

                    var position = this._getLatLng(obj);
                    if (position) {
                        bounds.extend(position);
                        validCount++;
                        panPosition = position;
                    } else {
                        logger.error(this.id + ": " + "Incorrect coordinates (" + this.checkAttrForDecimal(obj, this.latAttr) +
                                      "," + this.checkAttrForDecimal(obj, this.lngAttr) + ")");
                    }
                }));

                if (validCount < 2) {
                    this._googleMap.setZoom(this.lowestZoom);
                    this._googleMap.panTo(panPosition);
                } else {
                    this._googleMap.fitBounds(bounds);
                }

                this._executeCallback(callback);
            }));
        },

        _createLatLngObjs: function (objs, latlngs, callback) {
            // _createLatLngObjs is a recursive function. It tries to get the lat en lng of an object and passes the list of objects (minus the first) to itself
            logger.debug(this.id + "._createLatLngObjs: todo:" + objs.length + "/done:" + latlngs.length);
            if (objs.length === 0) {
                callback(latlngs);
            } else {
                var obj = objs.pop(),
                    latlngObj = {
                        mxObj: obj
                    };

                obj.fetch(this.latAttr, lang.hitch(this, function (lat) { // We do a fetch so we can get attributes over association
                    if (lat === null || lat === "") {
                        this._createLatLngObjs(objs, latlngs, callback);
                    } else {
                        if (typeof lat === "object") { // Big
                            lat = lat.toString();
                        }
                        latlngObj.lat = parseFloat(lat);
                        obj.fetch(this.lngAttr, lang.hitch(this, function (lng) {
                            if (lng === null || lng === "") {
                                this._createLatLngObjs(objs, latlngs, callback);
                            } else {
                                if (typeof lat === "object") { // Big
                                    lat = lat.toString();
                                }
                                latlngObj.lng = parseFloat(lng);

                                latlngs.push(latlngObj);
                                this._createLatLngObjs(objs, latlngs, callback);
                            }
                        }));
                    }
                }));
            }
        },

        _fetchFromDB: function (callback) {
            logger.debug(this.id + "._fetchFromDB");
            var xpath = "//" + this.mapEntity + this.xpathConstraint;

            this._removeAllMarkers();
            if (this._contextObj) {
                xpath = xpath.replace("[%CurrentObject%]", this._contextObj.getGuid());
                mx.data.get({
                    xpath: xpath,
                    callback: lang.hitch(this, function (objs) {
                        this._refreshMap(objs, callback);
                    })
                });
            } else if (!this._contextObj && (xpath.indexOf("[%CurrentObject%]") > -1)) {
                console.warn("No context for xpath, not fetching.");
                this._executeCallback(callback);
            } else {
                mx.data.get({
                    xpath: xpath,
                    callback: lang.hitch(this, function (objs) {
                        this._refreshMap(objs, callback);
                    })
                });
            }
        },

        _fetchFromCache: function (callback) {
            logger.debug(this.id + "._fetchFromCache");
            var cached = false,
                bounds = new google.maps.LatLngBounds();

            this._removeAllMarkers();

            dojoArray.forEach(this._markerCache, lang.hitch(this, function (marker, index) {
                if (this._contextObj) {
                    if (marker.id === this._contextObj.getGuid()) {
                        marker.setMap(this._googleMap);
                        bounds.extend(marker.position);
                        cached = true;
                    }
                } else {
                    marker.setMap(this._googleMap);
                }
                if (index === this._markerCache.length - 1) {
                    this._googleMap.fitBounds(bounds);
                }
            }));

            if (!cached) {
                this._fetchFromDB(callback);
            } else {
                this._executeCallback(callback);
            }
        },

        _removeAllMarkers: function () {
            logger.debug(this.id + "._removeAllMarkers");
            if (this._markerCache) {
                dojoArray.forEach(this._markerCache, function (marker) {
                    marker.setMap(null);
                });
            }
        },

        _addMarker: function (obj) {
            logger.debug(this.id + "._addMarker");
            var id = this._contextObj ? this._contextObj.getGuid() : null,
                marker = null,
                lat = obj.lat,
                lng = obj.lng,
                markerImageURL = null,
                url = null;

            marker = new google.maps.Marker({
                position: new google.maps.LatLng(lat, lng),
                map: this._googleMap
            });

            if (id) {
                marker.id = id;
            }

            if (this.markerDisplayAttr) {
                obj.mxObj.fetch(this.markerDisplayAttr, function (value) {
                    marker.setTitle(value);
                });
            }

            if (this.markerImages.length > 1 && this.enumAttr) {
                obj.mxObj.fetch(this.enumAttr, lang.hitch(this, function (enumeration) {
                    if (enumeration) {
                        dojoArray.forEach(this.markerImages, lang.hitch(this, function (imageObj) {
                            if (imageObj.enumKey === enumeration) {
                                marker.setIcon(window.mx.appUrl +  imageObj.enumImage);
                            }
                        }));
                    }
                }));
            } else if (this.defaultIcon) {
                marker.setIcon(window.mx.appUrl +  this.defaultIcon);
            }

            if (!this._markerCache) {
                this._markerCache = [];
            }

            if (this.onClickMarkerMicroflow) {
                marker.addListener("click", lang.hitch(this, function () {
                    this._execMf(this.onClickMarkerMicroflow, obj.mxObj.getGuid());
                }));
            }

            if (dojoArray.indexOf(this._markerCache, marker) === -1) {
                this._markerCache.push(marker);
            }
        },

        _getLatLng: function (obj) {
            logger.debug(this.id + "._getLatLng");
            var lat = obj.lat,
                lng = obj.lng;

            if (lat === "" && lng === "") {
                return this._defaultPosition;
            } else if (!isNaN(lat) && !isNaN(lng) && lat !== "" && lng !== "") {
                return new google.maps.LatLng(lat, lng);
            } else {
                return null;
            }
        },

        _goToContext: function (callback) {
            logger.debug(this.id + "._goToContext");
            this._removeAllMarkers();
            if (this._googleMap && this._contextObj) {
                this._refreshMap([ this._contextObj ], callback);
            } else {
                this._executeCallback(callback);
            }
        },

        _execMf: function (mf, guid, cb) {
            logger.debug(this.id + "._execMf");
            if (mf && guid) {
                mx.data.action({
                    params: {
                        applyto: "selection",
                        actionname: mf,
                        guids: [guid]
                    },
                    store: {
                        caller: this.mxform
                    },
                    callback: lang.hitch(this, function (obj) {
                        if (cb && typeof cb === "function") {
                            cb(obj);
                        }
                    }),
                    error: function (error) {
                        console.debug(error.description);
                    }
                }, this);
            }
        },

        _executeCallback: function (cb) {
            if (cb && typeof cb === "function") {
                cb();
            }
        }
    });
});

require(["GoogleMaps/widget/GoogleMaps"]);
