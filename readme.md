# UndoJs (BETA)

Accidentally deleted all of it instead of just the bit you wanted? On our deskops practically everything has an undo function. And yet, when on the web how come users almost always need to figure out themselves how to undo stuff they accidentally did? 

**Everything should be undoable!**

UndoJs seeks to facilitate the everything-undoable principle. It acts as a wrapper for existing functions.

# Features
- Undo any function call
- Just wrap existing functions
- Commands can be executed and undone in batches
- Optional caching

# Overview

UndoJs took away the idea of the command pattern that functions can be put aside and called or undone later. With a controller you decide what command to be called, when to call it and when to undo it. 

The design goals were to make the command logic independent from the functions that are wrapped and to be able to call commands like so:

```javascript
undojs.execute("someCommand", [a, b]);

// <=>

undojs.undo();
```


**Beta notice**

Practice testing in async environments will be in focus of the beta. Interface changes (file names, return types) are likely.


# Demo

[See it in action.](https://joe-kerr.github.io/undojs/demo.html)


# Install

```
npm install @joe_kerr/undojs
```


**Dev environment**

```javascript
import {Undojs} from "@joe_kerr/undojs"; 
```


**Browser**

```html
<script src="path_to_node_modules/@joe_kerr/undojs/dist/undojs.browser.js"></script>
<script>
const undojs = new window.undojs.Undojs();
</scrip>
```


# Usage

## Register and use of command

```javascript
// elsewhere

async serverPost(data) {...}

async serverGet(id) {...}


// commands setup

const undojs = new UndoJs();

const command = {
	name: "move",
	execute: serverPost
	
	async undo(params, returned, cached) {
		const id = params[0];
		const orgRes = await returned;
		const cache = await cached;
		cache.id = id;
		
		return (orgRes.err === null) ? serverPost(cache) : null;
	},
	
	async cache(params) {
		const id = params[0];
		const cache = await serverGet(id);
		return {x: cache.x, y: cache.y};
	}
};

undojs.register(command);

// move element 1 to location 120, 60
undojs.execute("move", {id: 1, x: 120, y: 60});

// move elements 2 and 3 in one operation
undojs.recordBatch([
	{name: "move", params: {id: 2, x: 240, y: 120}},
	{name: "move", params: {id: 3, x: 480, y: 180}}
]);

// move back elements 3 and 2 to their previous position in one operation
undojs.undo();

// move back element 1
undojs.undo();
```


## Caching

If you want to undo e.g. an addition operation (add(x)), you simply call add() again with minus the original parameter. What if you want to undo a style change of an element? You cannot really derive that information from known data. It is very helpful to have a caching function that provides an input to the undo function. 

However, there is a trade-off. You must cache before you change state. So the cache function must be forced to run before the execute function. If caching involves fetching data from a server, this can slow down the command.


# Versions

## 0.2.0
- Add: Reset and destroy for app restart / clean up
- Chg: Minor cleanups, fixes, changes

## 0.1.0
- Public beta release.


# Copyright

MIT (c) Joe Kerr 2019
