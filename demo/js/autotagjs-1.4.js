/*! autotagjs.js v1.4 https://github.com/motorstreak/autotag */
/*
 Version: 1.4
 Author: Navin Samuel
 Web: https://github.com/motorstreak/autotag
 Licensed under MIT License http://www.opensource.org/licenses/mit-license
*/

var Autotag = Autotag || {};
Autotag = (function() {
    // Configuration options
    //
    // splitter:    A callback function that can receive a string, split it and return
    //              the parts as an array. If not provided, the default
    //              splitter is used.
    //
    // decorator:   A callback function that receives nodes for processing.
    //              Use the decorator to apply styles on the node or do whatever
    //              processing you wish to do. If one is not provided, the
    //              default decorator will be used.
    //
    // The callback functions below are invoked before and after processing
    // the similarly named events. If any of the before<event> callbacks
    // return evaluates to false, jquery-autotag will not perform any action on
    // the registered input and the after<event> callbacks will not be invoked.
    //
    //      beforeKeypress(e) - called before processing a keydown event.
    //      afterKeypress - called after processing a keyup event.
    //      afterSelection
    //
    // ignoreReturnKey: If set to true, return key presses will be
    //              ignored. False by default.
    //
    // onReturnKey: A callback function that gets invoked when a return key
    //              press is detected during the keydown event. The callback will
    //              only be made if the 'ignoreReturnKey' flag is set to true.
    //
    // trace:     Set this to true to see debug messages on the console.

    return function(editor, config) {
        var activeSubmenu,

            // The line on which the input was captured. This is updated
            // each time a keyup event is triggered.
            inputLineNumber,

            // Stores the last selection made in the editor.
            selectionRange,

            // Continues the current text style to the next line and
            // across line breaks.
            continuingStyle,


            classListTemp,
            prevLineTemp,

            editorMenubar,
            autoWordTag = 'span',
            autoLineTag = 'p',

            blankListClassName = 'autotagjs-list-blank',
            defaultListClassName = 'autotagjs-list',

            menuClassName = 'autotagjs-menu',
            submenuClassName = 'autotagjs-submenu',
            paletteClassName = 'autotagjs-palette',
            paletteCellClassName = 'autotagjs-palette-cell',
            paletteRowClassName = 'autotagjs-palette-row';

        // Map keeyboard controls to format options since we override them.
        var styleKeyMap = {
            66: 'font-weight:bold',
            73: 'font-style:italic',
            85: 'text-decoration:underline'
        };


        function initParam(obj, toObj) {
            toObj = (typeof toObj === 'undefined') ? true : toObj;
            return ((typeof obj === 'undefined') || obj == null) ? toObj : obj;
        }

        // Dump logs for testing.
        function logToConsole(data, msg) {
            msg = initParam(msg, '');
            if (trace) console.log('TRACE : ' + msg + ' : ' + data);
        }

        function debounce(func, wait, immediate) {
            var timeout;
            return function() {
                var context = this,
                    args = arguments;

                var later = function() {
                    timeout = null;
                    if (!immediate) { func.apply(context, args); }
                };

                var callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);

                if (callNow) { func.apply(context, args); }
            };
        }

        // Initialize configuration.
        config = config || {};
        var ignoreReturnKey = config.ignoreReturnKey || false;
        var trace = config.trace || false;

        // Callbacks
        var decorator = config.decorator || function(node, text) {};

        // The default splitter splits on words.
        var splitter = config.splitter || function(str) {
            return str.match(/([^,\s\.]+)|[,\s\.]+/ig);
        };

        // Event callbacks
        var doAfterKeypress = config.afterKeypress || function() {};

        // Returns the tags under the selection.
        var doAfterSelection = config.afterSelection || function(tags) {};

        var doOnMenuClick = config.onMenuClick || function() {};

        // A leading Tag node, required to maintain consistancy in behavior
        // across browsers.
        var addPilotNodeToLine = function(line) {
            return line.appendChild(createBreakNode());
        };

        var updateList = function(line, prefix, level, force) {
            force = initParam(force, true);
            if (!initList(line)) {
                setListCounter(line, prefix, level);
                setListStyle(line, prefix, level, force);
            }
        };

        var initList = function(line) {
            if (isEditor(line.parentNode)) {
                updateListStyle(line, defaultListClassName);
                return true;
            }

            line.classList.remove(defaultListClassName);
            return false;
        };

        var getListPrefix = function(line, force) {
            force = initParam(force, false);

            if (isEditor(line)) {
                return 'autotagjs';
            }

            var names = line.className.match(/(\w+(-\w+)*)-list-\d+/);
            var prefix = names && names[1];
            return (prefix ? prefix : getListPrefix(line.parentNode, force));
        };


        var indentLine = function(line, prefix, refresh) {
            if(!isListIndenter(line)) {
                refresh = initParam(refresh, true);
                prefix = initParam(prefix, getListPrefix(line, true));

                var selection = getRangeContainersAndOffsets(selectionRange);

                // The second check (isEdi..) is required to acomodate Firefox which
                // appends the next lines class to the top line on a delete.
                if (isBlankList(line) || !isEditor(line.parentNode) && isRootList(line)) {
                    updateList(line, prefix, getIndentationIndex(line), refresh);
                } else {
                    var rootLine = getLine(line, true),
                        anchor = getPreviousLine(line);

                    if (!anchor) {
                        anchor = createNewLine(false);
                        line.parentNode.insertBefore(anchor, line);
                    }

                    initList(anchor);
                    anchor.appendChild(line);
                    updateList(line, prefix, getIndentationIndex(line), refresh);

                    // Now make line's children it's peer.
                    var children = getChildren(line, isLine);
                    for (var i=0; i < children.length; i++) {
                      line.parentNode.insertBefore(children[i], line.nextSibling);
                    }
                }
                setSelection(selection);
                paragraphize(getLine(), true);
            }
        };

        var outdentLine = function(line, refresh) {
            if(!isListIndenter(line)) {
                refresh = initParam(refresh, true);
                var parentLine = line.parentNode;

                if (!initList(line)) {
                    var selection = getRangeContainersAndOffsets(selectionRange);
                    prefix = getListPrefix(line, true);

                    // Now make line's children the anchor's children.
                    var children = getChildren(line, isLine);
                    if (children.length > 0) {
                        var anchor = createNewLine(false);
                        initList(anchor);

                        line.insertBefore(anchor, children[0]);
                        for (var i=0; i < children.length; i++) {
                          anchor.appendChild(children[i]);
                        }
                    }

                    while (line.nextSibling) {
                        line.appendChild(line.nextSibling);
                    }

                    parentLine.parentNode.insertBefore(line, parentLine.nextSibling);

                    var indentIndex = getIndentationIndex(parentLine),
                        level = updateList(line, prefix, indentIndex, refresh);

                    if ((getChildren(parentLine, isLine) +
                        getChildren(parentLine, isTag)) == 0) {
                        removeNode(parentLine);
                    }

                    setSelection(selection);
                    paragraphize(getLine(), true);
                }
            }
        };

        var updateListStyle = function(line, klass) {
            line.className = line.className.replace(/(\w+(-\w+)*)-list(-.+)*/g, '');
            line.classList.add(klass);
        };

        var removeListStyle = function(line) {
            updateListStyle(line, '');
        };

        var setBlankList = function(line) {
            updateListStyle(line, blankListClassName);
        };

        var isBlankList = function(line) {
            return line.classList.contains(blankListClassName);
        };

        var isListIndenter = function(line) {
            return !isEditor(line.parentNode) && !line.className.match(/(\w+(-\w+)*)-list(-.+)*/g);
        };

        var isRootList = function(line) {
            return line.classList.contains(defaultListClassName);
        };

        var applyCommand = function(target, commands) {
            if (Array.isArray(target)) {
                for (var i = 0; i < target.length; i++) {
                    applyCommand(target[i], commands);
                }
            } else {
                for (var j = 0; j < commands.length; j++) {
                    var cmd = commands[j];
                    if (cmd == 'clear') {
                        continuingStyle = null;
                        target.setAttribute('style', '');

                    } else if (cmd.match(/^list(\s+\w+(-\w+)*){1}/)) {
                        var listPrefix = cmd.split(/\s+/)[1];

                        switch(listPrefix) {
                            case 'clear':
                                // clearList(target);
                                break;
                            case 'indent':
                                indentLine(target);
                                break;

                            case 'outdent':
                                outdentLine(target);
                                break;

                            default:
                                indentLine(target, listPrefix);
                        }
                    }
                }
            }
        };

        var applyInstruction = function(nodes, instruction, declarations) {
            if (instruction == 'autotagjsCommand') {
                applyCommand(nodes, declarations);
            } else if (instruction == 'autotagjsCallback') {
                doOnMenuClick(declarations, nodes);
            } else {
                applyStyle(nodes, instruction, declarations);
            }
        };

        var applyStyle = function(target, instruction, declarations) {
            if (Array.isArray(target)) {
                for (var i = 0; i < target.length; i++) {
                    applyStyle(target[i], instruction, declarations);
                }
            } else {
                for (var j = 0; j < declarations.length; j++) {
                    var declaration = declarations[j].split(/\s*:\s*/),
                        property = declaration[0],
                        value = declaration[1];

                    var curValue = target.style.getPropertyValue(property);

                    if (instruction == 'autotagjsUnset' ||
                        instruction == 'autotagjsToggle' && curValue.length > 0) {
                        target.style.removeProperty(property);

                    } else if (instruction == 'autotagjsSet' ||
                        (instruction == 'autotagjsInitialize' ||
                        instruction == 'autotagjsToggle') &&
                        curValue.length === 0) {
                        target.style.setProperty(property, value);

                    } else if (instruction.match(/^autotagjs(Increment|Decrement)/)) {
                        curValue = curValue || getComputedStyle(target).getPropertyValue(property);
                        var amount = getPixelAmount(value),
                            curAmount = getPixelAmount(curValue);

                        if (instruction == 'autotagjsIncrement') {
                            curAmount += amount;
                        } else if (instruction == 'autotagjsDecrement') {
                            curAmount -= amount;
                        }

                        if (curAmount <= 0) {
                            target.style.removeProperty(property);
                        } else {
                            target.style.setProperty(property, curAmount + 'px');
                        }
                    }
                }
            }
        };

        // A Block node form a line element in the editor.
        var createBlockNode = function() {
            return document.createElement(autoLineTag);
        };

        var createBreakNode = function() {
            var node = document.createElement(autoWordTag);
            node.appendChild(document.createElement('br'));
            if (continuingStyle) {
                node.setAttribute('style', continuingStyle);
            }

            return node;
        };

        var createPalette = function(menu) {
            var palette = menu.getElementsByClassName(submenuClassName)[0];
            if (palette) {
                palette.style.display = '';
            } else {
                palette = document.createElement('div');
                palette.classList.add(submenuClassName);
                palette.classList.add(paletteClassName);
                menu.appendChild(palette);

                // Color palette
                var row, cell, maxCols = 10, maxRows = 5;

                var hueStep = Math.round(360 / maxCols),
                    saturationStep = Math.round(40 / maxRows),
                    luminosityStep = Math.round(80 / maxRows);

                for (var i = 0, s = 100, l = 94; i < maxRows; i++, s -= saturationStep, l -= luminosityStep) {
                    row = createPaletteRow(palette);
                    for (var j = 0, h = 0; j < maxCols; j++, h += hueStep) {
                        createPaletteCell(row, h, s, l);
                    }
                }

                row = createPaletteRow(palette);
                luminosityStep = Math.round(100 / maxCols);

                for (i = 0, l = 10; i < maxCols; i++, l += luminosityStep) {
                    createPaletteCell(row, 0, 0, l);
                }
            }
            activeSubmenu = palette;
        };

        var createPaletteCell = function(row, h, s, l) {
            var cell = document.createElement('div'),
                hsla = 'hsla(' + h + ', ' + s + '%, ' + l + '%, ' + '1.0)';

            cell.className = paletteCellClassName;
            cell.style.color = cell.style.background = hsla;
            row.appendChild(cell);
        };

        var createPaletteRow = function(palette) {
            var row = document.createElement('div');
            row.className = paletteRowClassName;
            return palette.appendChild(row);
        };

        var createNewLine = function(focus) {
            focus = initParam(focus, true);
            var line = createBlockNode();
            editor.appendChild(line);
            if (focus) {
                setCaret(addPilotNodeToLine(line), 0);
            }
            return line;
        };

        // Every text node in the editor is wrapped in a Tag node.
        var createTagNode = function(str) {
            var tagNode = document.createElement(autoWordTag);
            if (str) {
                tagNode.appendChild(createTextNode(str));
            }
            return tagNode;
        };

        var createTextNode = function(str) {
            // Firefox hack - without this, firefox will ignore the leading
            // space in the element causing all sorts of headache.
            str = str && str.replace(/ /g, '\u00a0') || '';
            return document.createTextNode(str);
        };


        // var findTagInLine = function(line, index) {
        //     index = (initParam(index) || index < 0) ? 0 : index;
        //     return line.querySelector('a:nth-child(' + index + ')');
        // };

        var fixCaret = function() {
            var range = getRange();
            var node = range.endContainer;

            if (node == range.startContainer) {
                if (isBreakTag(node)) {
                    setCaret(node, 0);
                } else if (isTag(node)) {
                    setCaret(node.lastChild, 0);
                } else if (isLine(node)) {
                    var tags = node.querySelectorAll(autoWordTag);
                    if (tags.length > 0) {
                        var tag = tags[range.endOffset - 1] || tags[tags.length - 1];
                        setCaret(tag.lastChild);
                    }
                }
            }
        };

        var fixEditor = function(clear) {
            if (initParam(clear, false) || !getFirstLine()) {
                removeAllChildNodes(editor);
                createNewLine();
            } else {
                // IE adds unwanted nodes sometimes.
                var lines = editor.childNodes;
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].tagName !== autoLineTag.toUpperCase()) {
                        removeNode(lines[i]);
                    }
                }
            }
        };

        var fixLine = function(line) {
            line = initParam(line, getLine());
            if (isLine(line)) {
                if (line.textContent.length > 0) {
                    removeBreakNodes(line);
                } else if (line.querySelectorAll(autoLineTag).length == 0) {
                    removeAllChildNodes(line);
                    setCaret(addPilotNodeToLine(line), 0);
                }
            }

            return line;
        };

        var fixText = function(node, offset) {
            offset = initParam(offset, 0);
            node = initParam(node, getRange().endContainer);
            if (isText(node)) {
                var parentNode = node.parentNode;
                if (isLine(parentNode)) {
                    var tagNode = createTagNode();
                    parentNode.insertBefore(tagNode, node);
                    tagNode.appendChild(node);
                    setCaret(node, offset);
                } else if (isTag(parentNode)) {
                    removeBreakNodes(parentNode);
                }
            }
            return node;
        };

        var formatSelection = function(dataset) {
            if (selectionRange && dataset) {
                var nodes;
                switch (dataset.autotagjsScope) {
                    case 'line':
                        nodes = getLinesInRange(selectionRange);
                        break;
                    case 'selection':
                        var tags = getTagsInRange(selectionRange);
                        var lines = getLinesInRange(selectionRange);
                        if (lines.length > 1 ||
                            tags.length == getTagsInLine(getLine()).length) {
                            nodes = tags.concat(lines);
                        } else {
                            nodes = tags;
                        }
                        break;
                    default:
                        nodes = getTagsInRange(selectionRange);
                }

                nodes = nodes.filter(Boolean);
                for (var key in dataset) {
                    if (dataset.hasOwnProperty(key)) {
                        applyInstruction(nodes, key, dataset[key].split(/\s*;\s*/));
                    }
                }
                resetRange(selectionRange);
            }
        };

        var getChildren = function(node, filter) {
            var children = [];
            node = node.firstChild;
            while(node) {
                if (!filter || filter(node)) {
                    children.push(node);
                }
                node = node.nextSibling;
            }
            return children;
        };



        var getFirstLine = function() {
            return editor.querySelector(autoLineTag + ':first-child');
        };

        var getIndentationIndex = function(line) {
            var level = 0;
            while ((line = line.parentNode) && !isEditor(line)) {
                level++;
            }
            // Indentation index is only 3 levels deep.
            return (level == 0 ? null : (level % 3 || 3));
        };

        var getKeyCode = function(e) {
            return (e.which || e.keyCode || 0);
        };

        // Returns the line on which this element is located.
        // If 'root' is set to true (false by default) the outermost or
        // root line is returned.
        var getLine = function(node, root) {
            root = initParam(root, false);
            node = initParam(node, getRange() && getRange().endContainer);

            while (node && !isEditor(node) && (root || !isLine(node))) {
                node = node.parentNode;
            }

            return isLine(node) ? node : getFirstLine();
        };

        var getLineNumber = function(line) {
            line = initParam(line, getLine());

            var lineNumber;
            if (isLine(line)) {
                lineNumber = 1;
                while ((line = line.previousSibling)) {
                    lineNumber++;
                }
            }
            return lineNumber;
        };

        var getLines = function(startLine, endLine) {
            var lines = [],
                line = startLine;
            do {
                lines.push(line);
                var children = getChildren(line, isLine);
                for (var i=0; i<children.length; i++) {
                    lines = lines.concat(getLines(children[i], endLine));
                }
            } while(line != endLine && (line = line.nextSibling));
            console.log(lines);
            return lines;
        };

        var getLinesInRange = function(range) {
            return getLines(
                getLine(range.startContainer),
                getLine(range.endContainer));
        };

        var getNextLine = function(line) {
            return getLine(line).nextSibling;
        };

        // var getNthChild = function(parentNode, childOffset) {
        //     if (isText(parentNode)) {
        //         return parentNode;
        //     }
        //
        //     var child = parentNode.firstChild;
        //     for (var i=2; i<=childOffset; i++) {
        //         child = child.nextSibling;
        //     }
        //     return child;
        // };

        // var getNextTag = function(node) {
        //     var next;
        //     if (node && !isEditor(node)) {
        //         if (isLine(node)) {
        //             next = node.firstChild;
        //         } else if (isTag(node) || isSoftWrap(node)) {
        //             next = node.nextSibling || getNextTag(node.parentNode.nextSibling);
        //         }
        //
        //         if (!next) {
        //             next = getNextTag(node.parentNode.nextSibling);
        //         }
        //
        //         if (isBreakTag(next)) {
        //             next = getNextTag(next.parentNode.nextSibling);
        //         }
        //     }
        //     return next;
        // };

        var getPixelAmount = function(value) {
            return parseInt(value && value.match(/^[-]*[0-9]+/)[0] || 0);
        };

        var getPreviousLine = function(line) {
            var prev = getLine(line).previousSibling;
            return isLine(prev) ? prev : null;
        };

        var getRange = function() {
            var selection, range;
            if (typeof window.getSelection != 'undefined') {
                selection = window.getSelection();
                if (selection.rangeCount) {
                    range = selection.getRangeAt(0);
                }
            } else if ((selection = document.selection) &&
                selection.type != 'Control') {
                range = selection.createRange();
            }

            return range;
        };

        var getRangeContainersAndOffsets = function(range) {
            return {
                startContainer : range.startContainer,
                endContainer : range.endContainer,
                startOffset : range.startOffset,
                endOffset : range.endOffset
            };
        };

        // var getRangeStartTag = function(range) {
        //     var node = range.startContainer;
        //     return isLine(node) && findTagInLine(node, range.startOffset + 1) ||
        //         isTag(node) && node ||
        //         isText(node) && node.parentNode;
        // };
        //
        // var getRangeEndTag = function(range) {
        //     var node = range.endContainer;
        //     return isLine(node) && findTagInLine(node, range.endOffset) ||
        //         isTag(node) && node ||
        //         isText(node) && node.parentNode;
        // };

        var getSiblings = function(node, filter) {
            return getChildren(node.parentNode, filter);
        };

        var getStylePropertyValue = function(node, property) {
            return node &&
                property &&
                window.getComputedStyle(node, null).getPropertyValue(property);
        };

        var getTag = function(node) {
            if (isText(node)) {
                return node.parentNode;
            } else if (isTag(node)) {
                return node;
            } else if (isLine(node)) {
                return getTagsInLine(line)[0];
            }
        };

        // var getTagsInRange = function(range) {
        //     var tag = getRangeStartTag(range),
        //         endTag = getRangeEndTag(range),
        //         tags = tag && [tag] || [];
        //
        //     while (tag && (tag !== endTag)) {
        //         tags.push(tag = getNextTag(tag));
        //     }
        //     return tags;
        // };


        var rangeIntersectsNode = function(range, node) {
            var nodeRange;
            if (range.intersectsNode) {
                return range.intersectsNode(node);
            } else {
                nodeRange = node.ownerDocument.createRange();
                try {
                    nodeRange.selectNode(node);
                } catch (e) {
                    nodeRange.selectNodeContents(node);
                }

                return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) == -1 &&
                    range.compareBoundaryPoints(Range.START_TO_END, nodeRange) == 1;
            }
        };

        var getTagsInRange = function(range) {
            var container = range.commonAncestorContainer;
            var textWalker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_TEXT,
                function(node) {
                    return rangeIntersectsNode(range, node) ? NodeFilter.FILTER_ACCEPT
                                                            : NodeFilter.FILTER_REJECT;
                },
                false
            );

            var tags = [];
            do {
                var node = textWalker.currentNode.parentNode;
                if (isTag(node)) { tags.push(node); }
            } while (textWalker.nextNode());

            return tags;
        };


        var getTagsInLine = function(line) {
            return isLine(line) && line.getElementsByTagName(autoWordTag);
        };

        var getTextNodes = function(node) {
            var text,
                textNodes = [],
                walker = getTextWalker(node);

            while ((text = walker.nextNode())) {
                textNodes.push(text);
            }
            return textNodes;
        };

        var getTextWalker = function(node) {
            return node &&
                document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
        };

        var gotoLine = function(line) {
            if (isLine(line)) {
                setCaret(line.querySelector(autoWordTag + ':first-child'), 0);
            }
        };

        var hideSubmenu = function() {
            if (activeSubmenu) {
                activeSubmenu.style.display = 'none';
            }
        };

        var isBreak = function(node) {
            return node && node.tagName == 'BR';
        };

        var isBreakTag = function(node) {
            return isTag(node) && isBreak(node.lastChild);
        };

        var isDeleteKey = function(code) {
            return code == 8;
        };

        var isEditor = function(node) {
            return node && node.isSameNode(editor);
        };

        var isFormatKey = function(code) {
            return (code == 66 || code == 73 || code == 85);
        };

        var isLine = function(node) {
            return node && node.tagName == autoLineTag.toUpperCase();
        };

        var isReturnKey = function(code) {
            return code == 13;
        };

        var isSoftWrap = function(node) {
            return node && node.tagName == 'DIV';
        };

        var isTabKey = function(code) {
            return code == 9;
        };

        var isTag = function(node) {
            return node && node.tagName == autoWordTag.toUpperCase();
        };

        var isText = function(node) {
            return node && node.nodeType == Node.TEXT_NODE;
        };


        var insertTab = function(node, index) {
            var tag = isText(node) ? node.parentNode : node;
            if (isTag(tag)) {
                var content = tag.textContent,
                    parent = tag.parentNode,
                    sibling = tag.nextSibling;

                var tab = createTagNode('    ');
                if (index === 0) {
                    parent.insertBefore(tab, tag);
                    setCaret(tag.firstChild, 0);
                } else if (index === tag.firstChild.length) {
                    parent.insertBefore(tab, sibling);
                    if (sibling) {
                        setCaret(sibling.firstChild, 0);
                    } else {
                        setCaret(tab.firstChild, 1);
                    }
                } else {
                    tag.textContent = content.substring(0, index);
                    parent.insertBefore(tab, sibling);

                    var lastTag = createTagNode(content.substring(index));
                    parent.insertBefore(lastTag, tab.nextSibling);
                    setCaret(lastTag.firstChild, 0);
                }
                paragraphize(getLine(), true);
            }
        };

        var paragraphize = function(root, refresh) {
            root = (root == null) ? editor : root;
            refresh = initParam(refresh, false) || true;

            if (refresh) {
                removeNodesInList(root.querySelectorAll('div'));
            }

            if (isLine(root)) {
                var tagNodes = root.querySelectorAll(autoWordTag);
                for (var i = 0; i < tagNodes.length; i++) {
                    softWrapNode(tagNodes[i]);
                }
            }
        };

        var performMenuAction = function(menu) {
            hideSubmenu();
            if (menu.dataset.autotagjsPalette) {
                createPalette(menu);
            } else if (menu.dataset.autotagjsSelect) {
                activeSubmenu = menu.getElementsByClassName(submenuClassName)[0];
                toggleSubmenu();
            } else {
                formatSelection(menu.dataset);
                paragraphize(getLine(), true);
            }
        };

        var processDeleteOrTabKey = function(range, keyCode, shifted) {
            if (range.collapsed) {
                var node = range.startContainer,
                    offset = range.startOffset,
                    line = getLine(node);

                if (getIndentationIndex(line)) {
                    if (isLine(node) ||
                        isBreakTag(node) && !node.previousSibling ||
                        isText(node) && !node.parentNode.previousSibling && offset == 0) {

                        if (isTabKey(keyCode)) {
                            if (shifted) {
                                outdentLine(line, false);
                            } else {
                                indentLine(line, null, false);
                            }
                        } else if (isDeleteKey(keyCode)) {
                            if (!isBlankList(line)) {
                                setBlankList(line);
                            } else {
                                outdentLine(line, false);
                            }
                        }
                        return true;
                    }
                    // Possibly tryig to insert tab in a list
                }

                if (isTabKey(keyCode) && !shifted) {
                    insertTab(node, offset);
                    return true;
                }
            }
            return false;
        };

        var processInput = function() {
            var range = getRange();
            var container = range.endContainer;

            if (isText(container)) {
                var offset = range.endOffset;
                fixText(container, offset);

                var refTag = container.parentNode,
                    parts = splitter(container.nodeValue || '');

                // Trim empty values from the array.
                parts = parts && parts.filter(Boolean) || '';
                var numparts = parts.length;

                logToConsole(parts, 'splitter');

                if (numparts > 1) {
                    // Prevent caret jump in Safari by hiding the original node.
                    refTag.style.display = 'none';

                    var newTag, length;
                    for (var i = 0; i < numparts; i++) {
                        newTag = createTagNode(parts[i]);
                        newTag.setAttribute('style', refTag.getAttribute('style'));
                        newTag.style.display = 'inline';
                        decorator(newTag, newTag.firstChild.nodeValue);
                        refTag.parentNode.insertBefore(newTag, refTag.nextSibling);

                        length = parts[i].length;
                        if (offset > 0 && offset <= length) {
                            setCaret(newTag.firstChild, offset);
                        }

                        offset = offset - length;
                        refTag = newTag;
                    }
                    removeNode(container.parentNode);
                } else {
                    decorator(refTag, refTag.firstChild.nodeValue);
                }
            } else if (isTag(container) && isText(container.firstChild)) {
                decorator(container, container.firstChild.nodeValue);
            }
        };

        var processKeyedInput = function() {
            fixLine();
            processInput();
            paragraphize(getLine(), true);
        };

        var processPastedInput = function(e) {
            var content;
            if (e.clipboardData) {
                content = (e.originalEvent || e)
                    .clipboardData.getData('text/plain');
            } else if (window.clipboardData) {
                content = window.clipboardData.getData('Text');
            }

            var container = getRange().endContainer;

            // In IE, selecting full text (Ctrl + A) will position the caret
            // on the editor element.
            if (isEditor(container)) {
                fixEditor(true);
                container = getRange().endContainer;
            }

            if (isText(container)) {
                container.nodeValue = container.nodeValue + content;
                setCaret(container);
            } else {
                var textNode = document.createTextNode(content);
                container.insertBefore(textNode, container.firstChild);
                setCaret(textNode);
            }
            processInput();
        };

        var processReturnKey = function() {
            if (ignoreReturnKey === false) {
                var current = getLine();
                if (getLineNumber(current) == inputLineNumber) {
                    current = getNextLine(current);
                } else {
                    fixLine(getPreviousLine(current));
                }

                fixLine(current);
                gotoLine(current);
                fixEditor();
                processInput();
                fixCaret();
            }
        };

        var removeAllChildNodes = function(node) {
            while (node && node.hasChildNodes()) {
                node.removeChild(node.lastChild);
            }
        };

        // Remove break nodes that have a text node as sibling, on the
        // given line and its descendent lines. #firefox.
        var removeBreakNodes = function(node) {
            var breakNodes = node && node.querySelectorAll('br');
            for (var i=0; i < breakNodes.length; i++) {
                if (getSiblings(breakNodes[i], isText).length > 0) {
                    removeNode(breakNodes[i]);
                }
            }
        };

        var removeNode = function(node) {
            return node && node.parentNode && node.parentNode.removeChild(node);
        };

        var removeNodesInList = function(nodeList) {
            for (var i=0; nodeList && i <= nodeList.length; i++) {
                removeNode(nodeList[i]);
            }
            return nodeList;
        };

        // Clears all existing ranges and sets it to the provided one.
        var resetRange = function(range) {
            if (range) {
                if (window.getSelection) {
                    var selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        selection.removeAllRanges();
                    }
                    selection.addRange(range);
                } else if (document.createRange) {
                    window.getSelection().addRange(range);
                } else if (document.selection) {
                    range.select();
                }
            }
            return range;
        };

        var saveSelectionRange = function() {
            selectionRange = getRange() || selectionRange;
            return selectionRange;
        };

        // Takes in the current node and sets the cursor location
        // on the first child, if the child is a Text node.
        var setCaret = function(node, offset) {
            offset = initParam(offset, node.length);
            return setSelection({
                startContainer: node,
                startOffset: offset,
                endContainer: node,
                endOffset: offset
            });
        };

        var setContinuingStyle = function() {
            var range = getRange();
            if (range) {
                var container = range.endContainer;
                var tag = isTag(container) && container ||
                    isText(container) && container.parentNode;
                if (tag) {
                    continuingStyle = tag.getAttribute('style');
                }
            }
        };

        var setListStyle = function(line, prefix, level, force) {
            var name = line.className;
            if (prefix && level && (force || !isBlankList(line))) {
                updateListStyle(line, prefix + "-list-" + level);
            }
        };

        var setListCounter = function(line, prefix, level) {
            line.parentNode.style.setProperty(
                'counter-reset', prefix + "-counter-" + level);
            line.style.setProperty(
                'counter-reset', prefix + "-counter-" + (level + 1));
        };

        var setSelection = function(obj) {
            var range,
                startNode = obj.startContainer,
                endNode = obj.endContainer;
            if (startNode && endNode) {
                var startOffset = initParam(obj.startOffset, 0),
                    endOffset = initParam(obj.endOffset, endNode.length);
                range = document.createRange();
                try {
                    range.setStart(startNode, startOffset);
                    range.setEnd(endNode, endOffset);
                    selectionRange = range;
                } catch (err) {
                    // Chrome does not like setting an offset of 1
                    // on an empty node.
                }
                resetRange(range);
            }
            return range;
        };

        var softWrapNode = function(node) {
            if (node) {
                var fontSize =
                    parseFloat(getStylePropertyValue(node, 'font-size'));

                if (node.getBoundingClientRect().height > fontSize * 1.3) {
                    var prevNode = node.previousSibling;
                    var wrap = prevNode && (prevNode.tagName === 'DIV');

                    if (!wrap) {
                        node.parentNode.insertBefore(
                            document.createElement('div'), node);
                    }
                }
            }
            return node;
        };

        var toggleSubmenu = function() {
            if (activeSubmenu) {
                var style = window.getComputedStyle(activeSubmenu);
                activeSubmenu.style.display = style.display === 'none' ? '' : 'none';
            }
        };

        // var updateIndentationOnDeleteOrTabKey = function(line, keyCode, shifted) {
        //     if (isTabKey(keyCode)) {
        //         if (shifted) {
        //             outdentLine(line, false);
        //         } else {
        //             indentLine(line, null, false);
        //         }
        //     } else if (isDeleteKey(keyCode)) {
        //         if (!isBlankList(line)) {
        //             setBlankList(line);
        //         } else {
        //             outdentLine(line, false);
        //         }
        //     }
        // };

        document.addEventListener('selectionchange', debounce(function(e) {
            if (saveSelectionRange()) {
                doAfterSelection(getTagsInRange(selectionRange));
            }
        }, 100));

        editor.addEventListener('dblclick', function(e) {
            saveSelectionRange();
        });

        editor.addEventListener('click', function(e) {
            hideSubmenu();
            fixLine();
            fixEditor();
        });

        editor.addEventListener('focus', function(e) {
            fixEditor();
        });

        editor.addEventListener('input', processKeyedInput);

        // Start handling events.
        editor.addEventListener('keydown', function(e) {
            inputLineNumber = getLineNumber();
            var range = getRange(),
                keyCode = getKeyCode(e);

            if (isDeleteKey(keyCode) || isTabKey(keyCode)) {
                if (processDeleteOrTabKey(range, keyCode, e.shiftKey)) {
                    e.preventDefault();
                }
                fixCaret();

                // console.log(getLine(range.startContainer).previousSibling);

            } else if (isReturnKey(keyCode)) {
                if (ignoreReturnKey) {
                    e.preventDefault();
                } else {
                    setContinuingStyle();
                }

            } else if (e.metaKey && isFormatKey(keyCode)) {
                formatSelection({ autotagjsToggle: styleKeyMap[keyCode] });
                e.preventDefault();
            }
        });

        editor.addEventListener('keyup', function(e) {
            var keyCode = getKeyCode(e);
            if (isDeleteKey(keyCode)) {
                if (isEditor(getRange().endContainer)) {
                    fixEditor();
                } else {
                    fixLine();
                }
                paragraphize(getLine(), true);
                // console.log(getLine(getRange().startContainer).previousSibling);
                // indentLine(getLine());
            } else if (isReturnKey(keyCode)) {
                processReturnKey();
            }
            doAfterKeypress();
        });

        editor.addEventListener('paste', function(e) {
            e.preventDefault();
            processPastedInput(e);
        });

        window.addEventListener('resize', debounce(function(e) {
            paragraphize(getLine(), true);
        }, 250));

        fixEditor();

        return {
            attachMenubar: function(menubar) {
                if (menubar) {
                    editorMenubar = menubar;
                    editorMenubar.addEventListener('click', function(e) {

                        // Ensure that the selection does not disapper after we have
                        // applied formatting.
                        resetRange(selectionRange);

                        var target = e.target;
                        if (target.classList.contains(menuClassName) ||
                            target.parentNode.classList.contains(submenuClassName)) {
                            performMenuAction(target);
                        } else if (target.parentNode.classList.contains(menuClassName)) {
                            performMenuAction(target.parentNode);
                        } else if (target.classList.contains(paletteCellClassName)) {
                            var declaration,
                                color = target.style.backgroundColor,
                                dataset = activeSubmenu.parentNode.dataset;

                            if (dataset.autotagjsPalette == 'color') {
                                declaration = 'color: ' + color;
                            } else if (dataset.autotagjsPalette == 'fill') {
                                declaration = 'background-color: ' + color;
                            }

                            dataset.autotagjsSet = declaration;
                            formatSelection(dataset);
                            hideSubmenu();
                        }
                    });
                }
            }
        };
    };
})();
