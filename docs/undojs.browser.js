var undojs=function(t){var n={};function e(o){if(n[o])return n[o].exports;var r=n[o]={i:o,l:!1,exports:{}};return t[o].call(r.exports,r,r.exports,e),r.l=!0,r.exports}return e.m=t,e.c=n,e.d=function(t,n,o){e.o(t,n)||Object.defineProperty(t,n,{enumerable:!0,get:o})},e.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},e.t=function(t,n){if(1&n&&(t=e(t)),8&n)return t;if(4&n&&"object"==typeof t&&t&&t.__esModule)return t;var o=Object.create(null);if(e.r(o),Object.defineProperty(o,"default",{enumerable:!0,value:t}),2&n&&"string"!=typeof t)for(var r in t)e.d(o,r,function(n){return t[n]}.bind(null,r));return o},e.n=function(t){var n=t&&t.__esModule?function(){return t.default}:function(){return t};return e.d(n,"a",n),n},e.o=function(t,n){return Object.prototype.hasOwnProperty.call(t,n)},e.p="",e(e.s=0)}([function(t,n,e){"use strict";function o(){this.commandNames={},this.commands=[],this.commandStack=[],this.batch=[],this.undoQueue=[],this.pendingUndos=0,this.undoing=!1,this.stackLimit=0,this.nextId=1,this.batchRecording=!1}e.r(n),o.prototype.register=function(t){if(void 0===t||void 0===t.name||void 0===t.execute||void 0===t.undo)throw new Error("Insufficient parameters in register(). Expected object with properties: <string>name, <func>execute, <func>undo. Got: "+JSON.stringify(t));if("function"!=typeof t.execute||"function"!=typeof t.undo||void 0!==t.cache&&"function"!=typeof t.cache)throw new Error("Parameter properties execute, undo and cache must be of type function");if(this.commandNames.hasOwnProperty(t.name))throw new Error("Tried to register existing command: "+t.name);const n=t.cache||null,e=t.context||null,o=this.commands.push({execute:t.execute,context:e,undo:t.undo,cache:n})-1;this.commandNames[t.name]=o},o.prototype.recordBatch=function(t){if(!(t instanceof Array))throw new Error("recordBatch requires an array of command functions.");const n=[];return this.batch.push([]),t.forEach(t=>{const e={name:t.name,batch:this.batch.length-1},o=this.execute(e,t.params);n.push(o)}),n},o.prototype._parseCommandInfo=function(t){const n=typeof t,e="Failed to execute command: ";if("string"===n)return{name:t,context:null};if("object"===n){if(void 0===t.name)throw new Error(e+"provide a name on the command info object or the name as a string instead of an object.");const n=typeof t.context;if("undefined"!==n&&"object"!==n)throw new Error(e+"context needs to be of type object");return t}throw new Error(e+"call with .execute(name<string>) or .execute({name<string>}<object>))")},o.prototype._verifyCommandExecution=function(t){if(this.undoing)throw new Error("Tried to execute a command from within undo process: command '"+t+"'");if(!this.commandNames.hasOwnProperty(t))throw new Error("Unknown command: "+t)},o.prototype.writeBatchInfoOfAsync=function(t,n){const e=this.batch[n],o=this.commandStack[this.commandStack.length-2];(0===e.length||e.indexOf(o.id)>-1)&&e.push(t)},o.prototype.writeBatchInfoOfSync=function(t,n){this.batch[n].push(t)},o.prototype.execute=async function(t,n){const{name:e,context:o}=this._parseCommandInfo(t);this._verifyCommandExecution(e);const r=this.nextId++,c=this.commandNames[e],i=this.commands[c],a=void 0===n?[]:n instanceof Array?n:[n],s=null!==o?o:i.context,u=null!==i.cache?await i.cache.call(s,a):await(async()=>{}),h=i.execute.apply(s,a),d=void 0!==h&&void 0!==h.then,m="number"==typeof t.batch;return!0===d?h.then(n=>{this.commandStack.push({id:r,index:c,params:a,returned:n,cached:u}),m&&this.writeBatchInfoOfAsync(r,t.batch)}).catch(t=>t):(this.commandStack.push({id:r,index:c,params:a,returned:h,cached:u}),m&&this.writeBatchInfoOfSync(r,t.batch)),h},o.prototype.enqueuedPendingUndo=async function(t){return new Promise((n,e)=>{t.unshift([n,e])})},o.prototype.asyncProcessPendingUndos=async function(t){const n=t.pop();try{n[0](await this.undo(!1))}catch(t){n[1](t)}},o.prototype.undoSingleCommand=async function(t,n,e){const o=t.pop();let r,c=!1;try{r=await n[o.index].undo(o.params,o.returned,o.cached)}catch(t){c=!0,r=t}return{response:r,hasErrors:c}},o.prototype.undoBatchCommand=async function(t,n,e){const o=e.pop().length,r=[];let c=[],i=!1;for(let e=0;e<o;e++){const e=t.pop();let o;try{"object"==typeof(o=n[e.index].undo(e.params,e.returned,e.cached))&&"function"==typeof o.catch&&o.catch(t=>(i=!0,t))}catch(t){o=Promise.reject(t),i=!0}r.push(o)}return{response:c=await Promise.all(r.map(t=>Promise.resolve(t).then(t=>t,t=>t))),hasErrors:i}},o.prototype.checkIsUndoOfBatchCommand=function(t,n){const e=t[t.length-1]||[],o=n[n.length-1].id;return e.indexOf(o)>-1},o.prototype.undo=async function(t=!0){if(this.undoQueue.length>this.commandStack.length)throw new Error("There are more undos pending than on the command stack.");if(0===this.commandStack.length)return;const n=!0===this.undoing&&!0===t;if(n&&this.undoQueue.length+1>this.commandStack.length)return;if(n)return this.enqueuedPendingUndo(this.undoQueue);this.undoing=!0;const e=!1===this.checkIsUndoOfBatchCommand(this.batch,this.commandStack)?"undoSingleCommand":"undoBatchCommand",o=await this[e](this.commandStack,this.commands,this.batch);let{response:r,hasErrors:c}=o;return c&&(r=Promise.reject(r),this.undoQueue=[]),this.undoing=!1,this.undoQueue.length>0&&this.asyncProcessPendingUndos(this.undoQueue),r},o.prototype.setLimit=function(t){if("number"!=typeof t||t<0)throw new Error("Limit parameter must be a number greater than or equal 0.");this.stackLimit=t},o.prototype.getLastCommandId=function(){return this.nextId-1},o.prototype.reset=function(){this.commandStack=[],this.batch=[]},o.prototype.destroy=function(){this.commands={},this.reset()},o.prototype.getAvailableCommands=function(){const t=[];for(const n in this.commands)t.push(n);return t},o.prototype.getCommandStack=function(){return this.commandStack};var r=o;e.d(n,"Undojs",function(){return r});n.default=r}]);