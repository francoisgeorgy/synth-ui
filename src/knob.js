
    "use strict";

    var knob = (function(elem, conf) {

        // It faster to access a property than to access a variable...
        // See https://jsperf.com/vars-vs-props-speed-comparison/1

        const NS = "http://www.w3.org/2000/svg";
        const CW = true;    // clock-wise
        const CCW = !CW;    // counter clock-wise

        var element = elem;    // DOM element

        // For the user convenience, the label can be set with the "data-label" attribute.
        // If another label is set in data-config then this later definition will override data-label.
        let default_label = element.dataset.label !== undefined ? element.dataset.label : '';

        let defaults = {
            // user configurable
            // no camelCase because we want to be able to have the same name in data- attributes.
            label: default_label,
            zero_at: 270.0,      // the 0 degree will be at 270 polar degrees (6 o'clock).
            arc_min: 30.0,          // Angle in dial coordinates (0 at 6 0'clock)
            arc_max: 330.0,         // Angle in dial coordinates (0 at 6 0'clock)
            cursor_start: 20,            // 20% of radius
            cursor_end: 30,            // 20% of radius
            cursor_only: false,  //TODO
            rotation: CW,
            value_min: 0.0,
            value_max: 100.0,
            value_resolution: 1,      // null means ignore
            snapToSteps: false,        // TODO
            valueFormating: null      // TODO; callback function
        };

        console.group("config");

        console.log(defaults);
        console.log(conf);
        console.log(element.dataset.config);
        // if (element.dataset.config) console.log(JSON.parse(element.dataset.config));

        let data_config = JSON.parse(element.dataset.config || '{}');

        console.log('data_config', data_config);

        let config = Object.assign({}, defaults, conf, data_config);

        console.log(config);

        console.log(JSON.stringify(config));

        console.groupEnd();


        // NOTE: viewBox must be 100x120: 100x100 for the arc and 100x20 below for the label.

        const HALF_WIDTH = 50;      // viewBox/2
        const HALF_HEIGHT = 50;     // viewBox/2
        const RADIUS = 40;          // a bit less than viewBox/2 to have a margin outside the arc. Must also takes into account the width of the arc stroke.

        // mouse drag support
        var currentTarget;
        var targetRect;

        // Center of arc in dial coordinates and in ViewPort's pixels relative to the <svg> ClientBoundingRect.
        var arcCenterXPixels = 0;
        var arcCenterYPixels = 0; // equal to arcCenterXPixels because the dial is a circle

        // start of arc, in ViewBox coordinates, computed once during the init
        var arcStartX;     // dial coordinates
        var arcStartY;     // dial coordinates

        // internals
        var minAngle = 0.0;      // initialized in init()
        var maxAngle = 0.0;      // initialized in init()
        var polarAngle = 0.0;       // Angle in polar coordinates (0 at 3 o'clock)
        var distance = 0.0;         // distance, in polar coordinates, from center of arc to last mouse position
        var path_start = '';        // SVG path syntax
        var mouseWheelDirection = 1;

        var value = 0.0;

        // let value = init;   // value is directly accessible via the getter and setter defined below
        // let getValue = function() {
        //     return value;
        // };
        // let setValue = function(v) {
        //     value = v;
        // };

        init();

        // let dialAngle = 120;
        setPolarAngle(dialToPolarAngle(270));     // TODO: remove setPolarAngle()



        function _getOS() {
            let userAgent = window.navigator.userAgent,
                platform = window.navigator.platform,
                macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
                windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
                iosPlatforms = ['iPhone', 'iPad', 'iPod'],
                os = null;

            if (macosPlatforms.indexOf(platform) !== -1) {
                os = 'Mac OS';
            } else if (iosPlatforms.indexOf(platform) !== -1) {
                os = 'iOS';
            } else if (windowsPlatforms.indexOf(platform) !== -1) {
                os = 'Windows';
            } else if (/Android/.test(userAgent)) {
                os = 'Android';
            } else if (!os && /Linux/.test(platform)) {
                os = 'Linux';
            }

            return os;
        }


        function init() {

            console.log('INIT');


            // compute min and max angles:
            minAngle = dialToPolarAngle(config.arc_min);
            maxAngle = dialToPolarAngle(config.arc_max);

            // set initial angle:
            setPolarAngle(minAngle);   // init polarAngle

            let angle_rad = getPolarAngle() * Math.PI / 180.0;

            // compute initial viewBox coordinates (independent from browser resizing)
            arcStartX = getViewboxX(Math.cos(angle_rad) * RADIUS);
            arcStartY = getViewboxY(Math.sin(angle_rad) * RADIUS);

            if (config.cursor_only) {
                // TODO
            }

            if (config.cursor_start > 0) {
                let cursorLength = RADIUS * ((100.0 - config.cursor_start) / 100.0);  // cursor is in percents
                let cursor_endX = getViewboxX(Math.cos(angle_rad) * cursorLength);
                let cursor_endY = getViewboxY(Math.sin(angle_rad) * cursorLength);
                path_start = `M ${cursor_endX},${cursor_endY} L`;
            } else {
                path_start = 'M';
            }

            path_start += `${arcStartX},${arcStartY} A ${RADIUS},${RADIUS}`;

            mouseWheelDirection = _getOS() === 'Mac OS' ? -1 : 1;

            draw();
            attachEventHandlers();
        };

        function getValue() {
            let i = polarToDialAngle(polarAngle);
            let v = ((i - config.arc_min) / (config.arc_max - config.arc_min)) * (config.value_max - config.value_min) + config.value_min;
            if (config.value_resolution === null) {
                return v;
            }
            return Math.round(v / config.value_resolution) * config.value_resolution;
        }

        /**
         * Angle in degrees in polar coordinates (0 degrees at 3 o'clock)
         */
        function setPolarAngle(angle) {
            let a = (angle + 360.0) % 360.0;    // we add 360 to handle negative values down to -360
            // apply boundaries
            let b = polarToDialAngle(a);
            if (b < config.arc_min) {
                a = minAngle;
            } else if (b > config.arc_max) {
                a = maxAngle;
            }
            polarAngle = a;
        }

        function incPolarAngle(increment) {
            setPolarAngle(polarAngle + increment);
        }

        /**
         * Angle in degrees in polar coordinates (0 degrees at 3 o'clock)
         */
        function getPolarAngle() {
            return polarAngle;
        }

        /**
         * Return polar coordinates angle from our "dial coordinates" angle
         */
        function dialToPolarAngle(angle) {
            let a = config.zero_at - angle;
            if (a < 0) a = a + 360.0;
            console.log(`dialToPolarAngle ${angle} -> ${a}`);
            return a;
        }

        function polarToDialAngle(angle) {
            //TODO: CCW or CW. "-" for changing CCW to CW
            return (config.zero_at - angle + 360.0) % 360.0;       // we add 360 to handle negative values down to -360
        }

        /**
         * Return viewBox X coordinates from cartesian -1..1 X
         */
        function getViewboxX(x) {

            // CW:  x = 20 --> 50 + 20 = 70
            // CCW: x = 20 --> 50 - 20 = 30

            return config.rotation === CW ? (HALF_WIDTH + x) : (HALF_WIDTH - x);
        }

        /**
         * Return viewBox Y coordinates from cartesian -1..1 Y
         */
        function getViewboxY(y) {
            return HALF_HEIGHT - y;  // HEIGHT - (HALF_HEIGHT + (RADIUS * y))
        }

        /**
         * angle is in degrees (polar, 0 at 3 o'clock)
         */
        function getPath(endAngle) {

            // SVG d: "A rx,ry xAxisRotate LargeArcFlag,SweepFlag x,y".
            // SweepFlag is either 0 or 1, and determines if the arc should be swept in a clockwise (1), or anti-clockwise (0) direction

            console.log(`getPath from ${minAngle} to ${endAngle}`);     // 240 330; 240-330=-90 + 360=270

            let a_rad = endAngle * Math.PI / 180.0;
            let endX = getViewboxX(Math.cos(a_rad) * RADIUS);
            let endY = getViewboxY(Math.sin(a_rad) * RADIUS);

            let deltaAngle = (minAngle - endAngle + 360.0) % 360.0;
            let largeArc = deltaAngle < 180.0 ? 0 : 1;

//        console.log(`deltaAngle ${deltaAngle} largeArc ${largeArc}`);

            let arcDirection = config.rotation === CW ? 1 : 0;

            if (config.cursor_only) {
                // TODO
            }

            let path = path_start + ` 0 ${largeArc},${arcDirection} ${endX},${endY}`;

            if (config.cursor_end > 0) {
                let cursorLength = RADIUS * ((100.0 - config.cursor_end) / 100.0);  // cursor is in percents
                let cursor_endX = getViewboxX(Math.cos(a_rad) * cursorLength);
                let cursor_endY = getViewboxY(Math.sin(a_rad) * cursorLength);
                path += `L ${cursor_endX},${cursor_endY}`;
            }

            console.log(path);

            return path;
        }

        /**
         *
         */
        function redraw() {
            //TODO: setLabel()
            //TODO: setValue()
            currentTarget.childNodes[1].textContent = polarToDialAngle(getPolarAngle()).toFixed(0);
            currentTarget.childNodes[2].textContent = getValue().toFixed(3);
            currentTarget.childNodes[3].setAttributeNS(null, "d", getPath(getPolarAngle()));
        }

        /**
         * startDrag() must have been called before to init the targetRect variable.
         */
        function mouseUpdate(e) {

            // MouseEvent.clientX (standard property: YES)
            // The clientX read-only property of the MouseEvent interface provides
            // the horizontal coordinate within the application's client area at which
            // the event occurred (as opposed to the coordinates within the page).
            // For example, clicking in the top-left corner of the client area will always
            // result in a mouse event with a clientX value of 0, regardless of whether
            // the page is scrolled horizontally. Originally, this property was defined
            // as a long integer. The CSSOM View Module redefined it as a double float.

            let dxPixels = e.clientX - targetRect.left;
            let dyPixels = e.clientY - targetRect.top;

            // mouse delta in cartesian coordinate with path center=0,0 and scaled (-1..0..1) relative to path:
            // <svg> center:       (dx, dy) == ( 0,  0)
            // <svg> top-left:     (dx, dy) == (-1,  1)
            // <svg> bottom-right: (dx, dy) == ( 1, -1) (bottom right of the 100x100 viewBox, ignoring the bottom 100x20 for the label)
            let dx = (dxPixels - arcCenterXPixels) / (targetRect.width / 2);
            let dy = - (dyPixels - arcCenterYPixels) / (targetRect.width / 2);  // targetRect.width car on a 20px de plus en hauteur pour le label

            if (config.rotation === CCW) dx = - dx;

            // convert to polar coordinates
            let angle_rad = Math.atan2(dy, dx);

            if (angle_rad < 0) angle_rad = 2.0*Math.PI + angle_rad;

            console.log(`mouseUpdate: position in svg = ${dxPixels}, ${dyPixels} pixels; ${dx.toFixed(3)}, ${dy.toFixed(3)} rel.; angle ${angle_rad.toFixed(3)} rad`);

            setPolarAngle(angle_rad * 180.0 / Math.PI);     // rads to degs

            // distance from arc center to mouse position
            distance = Math.sqrt(dx*(HALF_WIDTH/RADIUS)*dx*(HALF_WIDTH/RADIUS) + dy*(HALF_HEIGHT/RADIUS)*dy*(HALF_HEIGHT/RADIUS));

        }

        /**
         *
         * @param e
         */
        function startDrag(e) {

            e.preventDefault();

            // API: Event.currentTarget
            //      Identifies the current target for the event, as the event traverses the DOM. It always REFERS TO THE ELEMENT
            //      TO WHICH THE EVENT HANDLER HAS BEEN ATTACHED, as opposed to event.target which identifies the element on
            //      which the event occurred.
            //      https://developer.mozilla.org/en-US/docs/Web/API/Event/currentTarget

            currentTarget = e.currentTarget;

            // API: Element.getBoundingClientRect() (standard: YES)
            //      The Element.getBoundingClientRect() method returns the size of an element
            //      and its POSITION RELATIVE TO THE VIEWPORT.
            //      The amount of scrolling that has been done of the viewport area (or any other
            //      scrollable element) is taken into account when computing the bounding rectangle.
            //      This means that the rectangle's boundary edges (top, left, bottom, and right)
            //      change their values every time the scrolling position changes (because their
            //      values are relative to the viewport and not absolute).
            //      https://developer.mozilla.org/en/docs/Web/API/Element/getBoundingClientRect

            targetRect = currentTarget.getBoundingClientRect(); // currentTarget must be the <svg...> object

            // Note: we must take the boundingClientRect of the <svg> and not the <path> because the <path> bounding rect
            //       is not constant because it encloses the current arc.

            // By design, the arc center is at equal distance from top and left.
            arcCenterXPixels = targetRect.width / 2;
            //noinspection JSSuspiciousNameCombination
            arcCenterYPixels = arcCenterXPixels;

            document.addEventListener('mousemove', handleDrag, false);
            document.addEventListener('mouseup', endDrag, false);

            mouseUpdate(e);
            redraw();
        }

        /**
         *
         * @param e
         */
        function handleDrag(e) {
            e.preventDefault();
            mouseUpdate(e);
            redraw();
        }

        /**
         *
         */
        function endDrag() {
            document.removeEventListener('mousemove', handleDrag, false);
            document.removeEventListener('mouseup', endDrag, false);
        }

        var minDeltaY;

        function mouseWheelHandler(e) {

            // WheelEvent
            // This is the standard wheel event interface to use. Old versions of browsers implemented the two non-standard
            // and non-cross-browser-compatible MouseWheelEvent and MouseScrollEvent interfaces. Use this interface and avoid
            // the latter two.
            // The WheelEvent interface represents events that occur due to the user moving a mouse wheel or similar input device.

            // https://stackoverflow.com/questions/5527601/normalizing-mousewheel-speed-across-browsers
            // https://github.com/facebook/fixed-data-table/blob/master/src/vendor_upstream/dom/normalizeWheel.js

            e.preventDefault();

            let dy = e.deltaY;

            if (dy != 0) {
                // normalize Y delta
                if (minDeltaY > Math.abs(dy) || !minDeltaY) {
                    minDeltaY = Math.abs(dy);
                }
            }

            // important!
            currentTarget = e.currentTarget;

            incPolarAngle(mouseWheelDirection * (dy / minDeltaY));     // TODO: make mousewheel direction configurable

            // TODO: timing --> speed
            // https://stackoverflow.com/questions/22593286/detect-measure-scroll-speed

            redraw();

            return false;
        }

        function draw() {

            console.log('draw', element);

            // https://www.w3.org/TR/SVG/render.html#RenderingOrder:
            // Elements in an SVG document fragment have an implicit drawing order, with the first elements in the SVG document
            // fragment getting "painted" first. Subsequent elements are painted on top of previously painted elements.
            // ==> first element -> "painted" first

            let angleTo = 270;
            // let label = 'Label';

            let back = document.createElementNS(NS, "circle");
            back.setAttributeNS(null, "cx", "50");
            back.setAttributeNS(null, "cy", "50");
            back.setAttributeNS(null, "r", "40");
            back.setAttribute("class", "back");
            element.append(back);

            let valueText = document.createElementNS(NS, "text");
            valueText.setAttributeNS(null, "x", "50");
            valueText.setAttributeNS(null, "y", "55");
            valueText.setAttribute("class", "value");
            valueText.textContent = angleTo;
            element.appendChild(valueText);

            let labelText = document.createElementNS(NS, "text");
            labelText.setAttributeNS(null, "x", "50");
            labelText.setAttributeNS(null, "y", "110");
            labelText.setAttribute("class", "label");
            labelText.textContent = config.label;
            element.appendChild(labelText);

            let p = getPath(dialToPolarAngle(angleTo));     // TODO: value to arc

            let path = document.createElementNS(NS, "path");
            path.setAttributeNS(null, "d", p);
            path.setAttribute("class", "arc");

            element.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
            element.setAttributeNS(null, "viewBox", "0 0 100 120");
            element.setAttribute("class", "dial");
            element.appendChild(path);

        };  // draw()

        function attachEventHandlers() {
            element.addEventListener("mousedown", function(e) {
                startDrag(e);
            });
            element.addEventListener("wheel", function(e) {
                mouseWheelHandler(e);
            });
        };

        return {
            // get value() {
            //     return value;
            // },
            // set value(v) {
            //     value = v;
            // }
        };

    });
