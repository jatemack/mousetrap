/**
 * Copyright 2012 Craig Campbell
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Mousetrap is a simple keyboard shortcut library for Javascript with
 * no external dependencies
 *
 * @preserve @version 1.0
 * @url craig.is/killing/mice
 */

(function (definition, undefined) {
    'use strict';

    var Mousetrap = definition.call(undefined, this);

    var define = this.define;
    if(typeof define === 'function' && define.amd) {
        define('Mousetrap', function () {
            return Mousetrap;
        });
    } else {
        this.Mousetrap = Mousetrap;
    }
}).call(this, function (global) {

    'use strict';

    var setTimeout = global.setTimeout,
        clearTimeout = global.clearTimeout,
        document = global.document,
        HTMLElement = global.HTMLElement;

    /**
     * mapping of special keys to their corresponding keycodes
     *
     * @type {Object}
     */
    var _MAP = {
            'backspace': 8,
            'tab': 9,
            'enter': 13,
            'return': 13,
            'shift': 16,
            'ctrl': 17,
            'alt': 18,
            'option': 18,
            'capslock': 20,
            'esc': 27,
            'escape': 27,
            'space': 32,
            'pageup': 33,
            'pagedown': 34,
            'end': 35,
            'home': 36,
            'left': 37,
            'up': 38,
            'right': 39,
            'down': 40,
            'del': 46,
            'meta': 91,
            'command': 91,
            ';': 186,
            '=': 187,
            ',': 188,
            '-': 189,
            '.': 190,
            '/': 191,
            '`': 192,
            '[': 219,
            '\\': 220,
            ']': 221,
            '\'': 222,
            'f1': 112,
            'f2': 113,
            'f3': 114,
            'f4': 115,
            'f5': 116,
            'f6': 117,
            'f7': 118,
            'f8': 119,
            'f9': 120,
            'f10': 121,
            'f11': 122,
            'f12': 123,
            'f13': 124,
            'f14': 125,
            'f15': 126,
            'f16': 127,
            'f17': 128,
            'f18': 129,
            'f19': 130
        },

        /**
         * mapping of keys that require shift to their non shift equivalents
         *
         * @type {Object}
         */
        _SHIFT_MAP = {
            '~': '`',
            '!': '1',
            '@': '2',
            '#': '3',
            '$': '4',
            '%': '5',
            '^': '6',
            '&': '7',
            '*': '8',
            '(': '9',
            ')': '0',
            '_': '-',
            '+': '=',
            ':': ';',
            '\"': '\'',
            '<': ',',
            '>': '.',
            '?': '/',
            '|': '\\'
        },

        /**
         * mapping of keycodes to normalized equivalents
         *
         * @type {Object}
         */
        _KEYCODE_MAP = {
            // right command on webkit, command on gecko
            93: 91,
            224: 91,

            // map keypad numbers to top-of-keyboard numbers
            96: 48,
            97: 49,
            98: 50,
            99: 51,
            100: 52,
            101: 53,
            102: 54,
            103: 55,
            104: 56,
            105: 57
        },

        /**
         * a list of all the callbacks setup via Mousetrap.bind()
         *
         * @type {Object}
         */
        _callbacks = {},

        /**
         * direct map of string combinations to callbacks used for trigger()
         *
         * @type {Object}
         */
        _direct_map = {},

        /**
         * keeps track of what level each sequence is at since multiple
         * sequences can start out with the same sequence
         *
         * @type {Object}
         */
        _sequence_levels = {},

        /**
         * variable to store the setTimeout call
         *
         * @type {null|number}
         */
        _reset_timer,

        /**
         * temporary state where we will ignore the next keyup
         *
         * @type {boolean|number}
         */
        _ignore_next_keyup = false,

        /**
         * are we currently inside of a sequence?
         * type of action ("keyup" or "keydown") or false
         *
         * @type {boolean|string}
         */
        _inside_sequence = false;

    /**
     * cross browser add event method. implements only necessary event
     * attributes, and only the bubbling phase.
     *
     * @param {Element|HTMLDocument} object
     * @param {string} type
     * @param {Function} callback
     * @returns void
     */
    var _addEvent = HTMLElement.prototype.addEventListener ? function (el, type, callback) {
        el.addEventListener(type, callback, false);
    } : function (el, type, callback) {
        el.attachEvent('on' + type, function (e) {
            // assumes e has correct altKey, ctrlKey, metaKey, shiftKey, srcElement, and target
            e.which = e.keyCode;
            callback.call(el, e);
        });
    };

    /**
     * checks if two arrays are equal
     *
     * @param {Array} modifiers1
     * @param {Array} modifiers2
     * @returns {boolean}
     */
    function _arraysMatch(arr1, arr2) {
        var i,
            len = arr1.length;

        if (len !== arr2.length) {
            return false;
        }
        for (i = 0; i < len; i++) {
            if (arr1[i] !== arr2[i]) {
                return false;
            }
        }
        return true;
    }

    /**
     * resets all sequence counters except for the ones passed in
     *
     * @param {Object} do_not_reset
     * @returns void
     */
    function _resetSequences(do_not_reset) {
        var key,
            active_sequences = false;

        do_not_reset = do_not_reset || {};
        for (key in _sequence_levels) {
            if (!_sequence_levels.hasOwnProperty(key)) {
                continue;
            }
            if (do_not_reset[key]) {
                active_sequences = true;
            } else {
                _sequence_levels[key] = 0;
            }
        }

        if (!active_sequences) {
            _inside_sequence = false;
        }
    }

    /**
     * finds all callbacks that match based on the keycode, modifiers,
     * and action
     *
     * @param {number} code
     * @param {Array} modifiers
     * @param {string} action
     * @param {boolean=} remove - should we remove any matches
     * @returns {Array}
     */
    function _getMatches(code, modifiers, action, remove) {
        var i, len,
            callback,
            matches = [];

        // if there are no events related to this keycode
        if (!_callbacks[code]) {
            return [];
        }

        // if a modifier key is coming up on its own we should allow it
        if (action == 'keyup' && _isModifier(code)) {
            modifiers = [code];
        }

        // loop through all callbacks for the key that was pressed
        // and see if any of them match
        for (i = 0, len = _callbacks[code].length; i < len; i++) {
            callback = _callbacks[code][i];

            // if this is a sequence but it is not at the right level
            // then move onto the next match
            if (callback.seq && _sequence_levels[callback.seq] != callback.level) {
                continue;
            }

            // if this is the same action and uses the same modifiers then it
            // is a match
            if (action == callback.action && _arraysMatch(modifiers, callback.modifiers)) {

                // remove is used so if you change your mind and call bind a
                // second time with a new function the first one is overwritten
                if (remove) {
                    _callbacks[code].splice(i, 1);
                }

                matches.push(callback);
            }
        }

        return matches;
    }

    /**
     * takes a key event and figures out what the modifiers are
     *
     * @param {Event} e
     * @returns {Array}
     */
    function _eventModifiers(e) {
        var modifiers = [];

        if (e.shiftKey) {
            modifiers.push(_MAP.shift);
        }
        if (e.altKey) {
            modifiers.push(_MAP.alt);
        }
        if (e.ctrlKey) {
            modifiers.push(_MAP.ctrl);
        }
        if (e.metaKey) {
            modifiers.push(_MAP.command);
        }

        return modifiers;
    }

    /**
     * fires a callback for a matching keycode
     *
     * @param {string} action
     * @param {Event} e
     * @returns void
     */
    function _fireCallback(action, e) {
        var i, len,
            code = _KEYCODE_MAP.hasOwnProperty(e.which) ? _KEYCODE_MAP[e.which] : e.which,
            callbacks = _getMatches(code, _eventModifiers(e), action),
            do_not_reset = {},
            processed_sequence_callback = false,
            element = e.target || e.srcElement,
            tag_name = element.tagName;

        if ((' ' + element.className + ' ').indexOf(' mousetrap ') > -1) {
            // the element has the class "mousetrap"; no need to stop
        } else if (tag_name == 'INPUT' || tag_name == 'SELECT' || tag_name == 'TEXTAREA') {
            // stop for input, select, and textarea
            return;
        }

        // loop through matching callbacks for this key event
        for (i = 0, len = callbacks.length; i < len; i++) {

            // fire for all sequence callbacks
            // this is because if for example you have multiple sequences
            // bound such as "g i" and "g t" they both need to fire the
            // callback for matching g cause otherwise you can only ever
            // match the first one
            if (callbacks[i].seq) {
                processed_sequence_callback = true;

                // keep a list of which sequences were matches for later
                do_not_reset[callbacks[i].seq] = 1;
                callbacks[i].callback.call(document, e);
            } else if (!processed_sequence_callback && !_inside_sequence) {
                // if there were no sequence matches but we are still here
                // that means this is a regular match so we should fire then break
                callbacks[i].callback.call(document, e);
                break;
            }
        }

        // if you are inside of a sequence and the key you are pressing
        // is not a modifier key then we should reset all sequences
        // that were not matched by this key event
        if (action == _inside_sequence && !_isModifier(code)) {
            _resetSequences(do_not_reset);
        }
    }

    /**
     * handles a keydown event
     *
     * @param {Event} e
     * @returns void
     */
    function _handleKeyDown(e) {
        _fireCallback('keydown', e);
    }

    /**
     * handles a keyup event
     *
     * @param {Event} e
     * @returns void
     */
    function _handleKeyUp(e) {
        if (_ignore_next_keyup === e.which) {
            _ignore_next_keyup = false;
            return;
        }
        _fireCallback('keyup', e);
    }

    /**
     * determines if the keycode specified is a modifier key or not
     *
     * @param {number} code
     * @returns {boolean}
     */
    function _isModifier(code) {
        // 16, 17, 18, and 91 are modifier keys
        return (code > 15 && code < 19) || code == 91;
    }

    /**
     * called to set a 1 second timeout on the specified sequence
     *
     * this is so after each key press in the sequence you have 1 second
     * to press the next key before you have to start over
     *
     * @returns void
     */
    function _resetSequence() {
        clearTimeout(_reset_timer);
        _reset_timer = setTimeout(_resetSequences, 1000);
    }

    /**
     * binds a key sequence to an event
     *
     * @param {string} combo - combo specified in bind call
     * @param {Array} keys
     * @param {Function} callback
     * @param {string} action
     * @returns void
     */
    function _bindSequence(combo, keys, callback, action) {
        /**
         * callback to increase the sequence level for this sequence and reset
         * all other sequences that were active
         *
         * @param {Event} e
         * @returns void
         */
        var i, len,
            _increaseSequence = function(e) {
                _inside_sequence = action;
                _sequence_levels[combo]++;
                _resetSequence();
            },

            /**
             * wraps the specified callback inside of another function in order
             * to reset all sequence counters as soon as this sequence is done
             *
             * @param {Event} e
             * @returns void
             */
            _callbackAndReset = function(e) {
                callback.call(document, e);

                // we should ignore the next key up if the action is key down
                // this is so if you finish a sequence and release the key
                // the final key will not trigger a keyup
                if (action === 'keydown') {
                    _ignore_next_keyup = e.which;
                }

                // weird race condition if a sequence ends with the key
                // another sequence begins with
                setTimeout(_resetSequences, 10);
            };

        // start off by adding a sequence level record for this combination
        // and setting the level to 0
        _sequence_levels[combo] = 0;

        // loop through keys one at a time and bind the appropriate callback
        // function.  for any key leading up to the final one it should
        // increase the sequence. after the final, it should reset all sequences
        for (i = 0, len = keys.length; i < len; i++) {
            _bindSingle(keys[i], i < len - 1 ? _increaseSequence : _callbackAndReset, action, combo, i);
        }
    }

    /**
     * binds a single keyboard combination
     *
     * @param {string} combination
     * @param {Function} callback
     * @param {string} action
     * @param {string=} sequence_name - name of sequence if part of sequence
     * @param {number=} level - what part of the sequence the command is
     * @returns void
     */
    function _bindSingle(combination, callback, action, sequence_name, level) {

        // make sure multiple spaces in a row become a single space
        combination = combination.replace(/\s+/g, ' ');

        var i, len, keys, key,
            sequence = combination.split(' '),
            modifiers = [];

        // if this pattern is a sequence of keys then run through this method
        // to reprocess each pattern one key at a time
        if (sequence.length > 1) {
            return _bindSequence(combination, sequence, callback, action);
        }

        // take the keys from this pattern and figure out what the actual
        // pattern is all about
        keys = combination === '+' ? ['+'] : combination.split('+');

        for (i = 0, len = keys.length; i < len; i++) {
            key = keys[i];

            // if this is a key that requires shift to be pressed such as ?
            // or $ or * then we should set shift as the modifier and map the
            // key to the non shift version of the key
            if (_SHIFT_MAP[key]) {
                modifiers.push(_MAP.shift);
                key = _SHIFT_MAP[key];
            }

            // determine the keycode for the key
            // first check in the key map then fallback to character code
            key = _MAP[key] || key.toUpperCase().charCodeAt(0);

            // if this key is a modifier then add it to the list of modifiers
            if (_isModifier(key)) {
                modifiers.push(key);
            }
        }

        // make sure to initialize array if this is the first time
        // a callback is added for this key
        if (!_callbacks[key]) {
            _callbacks[key] = [];
        }

        // remove an existing match if there is one
        _getMatches(key, modifiers, action, !sequence_name);

        // add this call back to the array
        // if it is a sequence put it at the beginning
        // if not put it at the end
        //
        // this is important because the way these are processed expects
        // the sequence ones to come first
        _callbacks[key][sequence_name ? 'unshift' : 'push']({
            callback: callback,
            modifiers: modifiers,
            action: action,
            seq: sequence_name,
            level: level
        });
    }


    // Bind events on document, don't need to wait for window-load or DOMReady for this
    _addEvent(document, 'keydown', _handleKeyDown);
    _addEvent(document, 'keyup', _handleKeyUp);


    return {

        /**
         * binds an event to mousetrap
         *
         * can be a single key, a combination of keys separated with +,
         * a comma separated list of keys, an array of keys, or
         * a sequence of keys separated by spaces
         *
         * be sure to list the modifier keys first to make sure that the
         * correct key ends up getting bound (the last key in the pattern)
         *
         * @param {string|Array} keys
         * @param {Function} callback
         * @param {string} action - 'up' for keyup anything else assumes keydown
         * @returns void
         */
        bind: function(keys, callback, action) {
            var i, len;

            action = action || 'keydown';
            keys = keys instanceof Array ? keys : keys.split(',');
            for (i = 0, len = keys.length; i < len; i++) {
                _bindSingle(keys[i], callback, action);
            }
            _direct_map[keys + ':' + action] = callback;
        },

        /**
         * triggers an event that has already been bound
         *
         * @param {string} keys
         * @param {string} action
         * @returns void
         */
        trigger: function(keys, action) {
            var key = keys + ':' + (action || 'keydown');
            if (_direct_map.hasOwnProperty(key)) {
                _direct_map[key].call(document);
            }
        },

        /**
         * resets the library back to its initial state.  this is useful
         * if you want to clear out the current keyboard shortcuts and bind
         * new ones - for example if you switch to another page
         *
         * @returns void
         */
        reset: function() {
            _callbacks = {};
            _direct_map = {};
        }
    };
});