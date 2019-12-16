/// Creates a new Undojs class. Be wary that this is the synchronous version of the Undojs. If, e.g., you call two undos, these are not awaited so that the second may finish before the first. 
/// @class
function Undojs() {
	
	/// Index mapping human readable command names
	/// @private
	this.commandNames = {};
	
	/// Array holding all command definitions.
	/// @private
	this.commands = [];
	
	/// Stack holding all commands that have been executed.
	this.commandStack = [];

	/// A command batch is a set of commands that is undone as a set.
	/// @private
	this.batch = [];
	
	/// Needed to enforce ordered execution of undos (execat reverse of commandStack).
	/// @example 
	/// 0 (+ 2) (* 3) (- 4)
	/// //Assume these are async operations (disregard precedence) that have finished in this order. Must be undone in this exact order or results will be wrong.
	/// @private	
	this.undoQueue = [];
	
	this.pendingUndos = 0;
	this.processingCacheState = {};
	this.processingUndoState = null;
	this.undoing = false;
	this.aborting = false;
	
	this.stackLimit = 0;
	this.nextId = 1;	
	this.batchRecording = false;
}

/// Define a reusable command.
/// @function Undojs#register
/// @param {object} command - Command definition.
/// @param {string} command.name - The name of the command.
/// @param {function} command.execute - The function that should be called on execute.
/// @param {function} command.undo - The function that reverses that what execute did.
/// @param {function} [command.cache] - A function that caches any data before execute is called and provided to undo.
/// @param {object} [command.context] - The context the command should be called with.
/// @throws Throws if mandatory parameters missing, types are not as indicated or if a command already exists.
Undojs.prototype.register = function register(command) {
	if(typeof command === "undefined" || typeof command.name === "undefined" || typeof command.execute === "undefined" || typeof command.undo === "undefined") {
		throw new Error("Insufficient parameters in register(). Expected object with properties: <string>name, <func>execute, <func>undo. Got: "+JSON.stringify(command));
	}	
	
	if(typeof command.execute !== "function" || typeof command.undo !== "function" || (typeof command.cache !== "undefined" && typeof command.cache !== "function")) {
		throw new Error("Parameter properties execute, undo and cache must be of type function");
	}
	
	if(this.commandNames.hasOwnProperty(command.name)) {
		throw new Error("Tried to register existing command: "+command.name);
	}
	
	const cache = command.cache || null;
	const context = command.context || null;
	
	const idx = this.commands.push({"execute": command.execute, "context": context, "undo": command.undo, "cache": cache}) - 1;
	this.commandNames[command.name] = idx;
	//this.commands[command.name] = {"execute": command.execute, "context": context, "undo": command.undo, "cache": cache};
}

/// Execute a set of commands that should be undone as a set. Say, a user moves a bunch of elements. If this was handled by looping a move-command, an undo call would just undo the move of the last element. The function will not execute commands in sequence (Promise.all).
/// @function Undojs#recordBatch
/// @param {array} commandObjects - An array of command objects (see also {@link Undojs#execute}).
/// @param {string} commandObjects.name - The name of the command.
/// @param {array} commandObjects.params - The function parameters.
/// @returns {array} - Passes through the return values of the commands as array.
Undojs.prototype.recordBatch = function recordBatch(commandObjects) {
	if(!(commandObjects instanceof Array)) {
		throw new Error("recordBatch requires an array of command functions.");
	}
	
	if(commandObjects.length === 0) {
		throw new Error("recordBatch received an empty array.");
	}
	
	const returns = [];
	this.batch.push([]);
	
	commandObjects.forEach((command)=>{		
		if(typeof command !== "object") {
			throw new Error("Element of array parameter of recordBatch must be of type object. Got: "+JSON.stringify(commandObjects));
		}
		
		if(command.name === undefined) {
			throw new Error("Element of array parameter of recordBatch must have property name (of the command).");
		}
		
		const commandInfo = {name: command.name, batch: this.batch.length-1};					
		const res = this.execute(commandInfo, command.params);
		returns.push(res);
	});
	
	return returns;
}

Undojs.prototype._parseCommandInfo = function parseCommandInfo(commandInfo) {
	const type = typeof commandInfo;
	const errorPrefix = "Failed to execute command: ";
	
	if(type === "string") {
		return {name: commandInfo, context: null}
	}
	
	else if(type === "object") {
		if(commandInfo.name === undefined) {
			throw new Error(errorPrefix+"provide a name on the command info object or the name as a string instead of an object.");
		}
		
		const typeContext = typeof commandInfo.context;
		if(typeContext !== "undefined" && typeContext !== "object") {
			throw new Error(errorPrefix+"context needs to be of type object");
		}
		
		return commandInfo;
	}
	
	throw new Error(errorPrefix+"call with .execute(name<string>) or .execute({name<string>}<object>))");
}

Undojs.prototype._verifyCommandExecution = function verifyCommandExecution(name) {
	if(this.undoing) {
		throw new Error("Tried to execute a command from within undo process: command '"+name+"'");
	}
	
	if(!this.commandNames.hasOwnProperty(name)) {
		throw new Error("Unknown command: "+name);
	}	
}

Undojs.prototype._writeBatchInfoOfAsync = function _writeBatchInfoOfAsync(commandId, batchIndex) {
	const currentBatch = this.batch[batchIndex];
	const previousCommand = this.commandStack[ this.commandStack.length - 2 ];
	const isThisCommandInSameBatchAsPrevious = (currentBatch.length === 0 || currentBatch.indexOf(previousCommand.id) > -1);
	
	if(isThisCommandInSameBatchAsPrevious) {
		currentBatch.push(commandId);
	}	
}

Undojs.prototype._writeBatchInfoOfSync = function _writeBatchInfoOfSync(commandId, batchIndex) {
	const currentBatch = this.batch[batchIndex];
	currentBatch.push(commandId);	
}

/// Execute the specific command previously defined with {@link Undojs#register}
/// @async
/// @function Undojs#execute
/// @param {(string|object)} commandInfo - The name of the command as string or an object: 
/// @param {object} commandInfo.name - The name of the command.
/// @param {object} commandInfo.context - The context the command (and optional cache function) should be called with.
/// @param {var|array} [params] - The parameters of the underlying function wrapped in an array. A single parameter that is not an array may be passed as is.
/// @returns {var} - Passes through the return value of the command.
/// @example <caption>Call with parameters</caption>
/// controller.execute("someCommand", ["param1", 2, 3]); // => underlyingFunction("param1", 2, 3);
/// @example <caption>Simplified call with single parameter</caption>
/// controller.execute("someCommand", "param"); // => underlyingFunction("param");
/// @example <caption>Call with single parameter of type array</caption>
/// controller.execute("someCommand", [["param_array"]]); // => underlyingFunction(["param_array"]);
/// //compare:
/// controller.execute("someCommand", ["param_array"]); // => underlyingFunction("param_array");
Undojs.prototype.execute = async function execute(commandInfo, _params) {				
	const {name, context} = this._parseCommandInfo(commandInfo);
	this._verifyCommandExecution(name);
	
	const id = this.nextId++; 
	const commandIndex = this.commandNames[name];
	const command = this.commands[commandIndex];

	const params = (typeof _params === "undefined") ? [] : (_params instanceof Array) ? _params : [_params];
	const finalContext = (context !== null) ? context : command.context;
	
	//It would be more efficient to null cache. But then the function has a conditional await. Makes it too messy.
	const enforceSameOrderOfExecution = async ()=>{};
	
	const cached = (command.cache !== null) ? command.cache.call(finalContext, params) : enforceSameOrderOfExecution;
	
	this.processingCacheState[id] = cached;
	await cached;
	delete this.processingCacheState[id];
	
	if(this.aborting) {
		return;
	}
	
	const returned = command.execute.apply(finalContext, params);
	const isAsync = (returned !== undefined && returned.then !== undefined);
	const isBatch = (typeof commandInfo.batch === "number");

	if(isAsync === true) {
//console.log(commandInfo, "is async")
		returned.then((_returned)=>{
			this.commandStack.push({id, index: commandIndex, params, returned: _returned, cached});
			
			if(isBatch) {				
				this._writeBatchInfoOfAsync(id, commandInfo.batch);
			}			
		}).catch(e=>e);
	}
	
	else {
//console.log(commandInfo, "is sync");
		this.commandStack.push({id, index: commandIndex, params, returned, cached});
		
		if(isBatch) {
			this._writeBatchInfoOfSync(id, commandInfo.batch);
		}	
	}

	return returned;
	//
	/*
	const returned = command.execute.apply(finalContext, params);
	
	if(this.stackLimit > 0 && this.commandStack.length >= this.stackLimit) {
		this.commandStack.shift();
	}
		
	this.commandStack.push({id, index: commandIndex, params, returned, cached});

	return returned;
	*/
}

Undojs.prototype._enqueuedPendingUndo = async function _enqueuedPendingUndo(undoQueue) {
	return new Promise((resolve, reject)=>{
		undoQueue.unshift([resolve, reject]);
	});	
}

Undojs.prototype._asyncProcessPendingUndos = async function _asyncProcessPendingUndos(undoQueue) {
	const pendingUndo = undoQueue.pop();

	try {
		pendingUndo[0]( await this.undo(false) );
	}
	catch(e) {
		pendingUndo[1](e);
	}
}

Undojs.prototype._undoSingleCommand = async function _undoSingleCommand(commandStack, commands, batch) {
	const command = commandStack.pop();	
	let hasErrors = false;
	let response;	
	
	try {
		response = await commands[command.index].undo(command.params, command.returned, command.cached);
	}
	catch(e) {
		hasErrors = true;
		response = e;
	}
	
	return {response, hasErrors};
}

Undojs.prototype._undoBatchCommand = async function _undoBatchCommand(commandStack, commands, _batch) {
	const batch = _batch.pop();
	const nCommandsInBatch = batch.length;
	const promises = [];
	let response = [];	
	let hasErrors = false;
	
	for(let i=0; i<nCommandsInBatch; i++) {
		const command = commandStack.pop();
		
		let individualResponse;
		try {
			individualResponse = commands[command.index].undo(command.params, command.returned, command.cached);
							
			if(typeof individualResponse === "object" && typeof individualResponse.catch === "function") {
				//Notice catch block: requires await below to be effective!
				individualResponse.catch((e)=>{ 
					//console.log("3a", "caught async error", e.constructor.name); 
					hasErrors = true;
					return e;
				});
			}			
		}
		catch(e) {
			//console.log("3b", "caught sync error", e.constructor.name);
			individualResponse = Promise.reject(e);
			hasErrors = true;
		}
		
		promises.push(individualResponse);			
	}
			
	// Adapted from https://github.com/pgaubatz/node-promise-settle/blob/master/lib/promise-settle.js; 3-Dec-2019
	// Prevents fail-fast beavhiour of Promise.all. Instead of failing writes error to respective array index.
	// Trade-off: errors do not propagate (throw)		
	response = await Promise.all(promises.map( (promise)=>(Promise.resolve(promise).then(d=>d, e=>e)) ));	
	
	return {response, hasErrors};
}


Undojs.prototype._checkIsUndoOfBatchCommand = function _checkIsUndoOfBatchCommand(batch, commandStack) {
	const lastBatch = batch[batch.length - 1] || [];
	const lastCommandsIdInStack = commandStack[ commandStack.length - 1 ].id;
	return (lastBatch.indexOf(lastCommandsIdInStack) > -1);	
}

/// Reverse the last command that was executed ({@link Undojs#execute})
/// @async
/// @function Undojs#undo
/// @returns {(var|array)} - Passes through the return value of the command or an array of return values if a batch has been undone.
Undojs.prototype.undo = async function undo(isUserCall=true) {			
	//dev only; should never happen
	if(this.undoQueue.length > this.commandStack.length) {
		throw new Error("There are more undos pending than on the command stack.");
	}
	//
	
	if(this.commandStack.length === 0) {
		return;
	}
	
	const isToBeQueued = (this.undoing === true && isUserCall === true);
	
	if(isToBeQueued && this.undoQueue.length + 1 > this.commandStack.length) {
		return;
	}	
	else if(isToBeQueued) {
		return this._enqueuedPendingUndo(this.undoQueue);
	}
	
	this.undoing = true;
	//
	let undoFinishSignal;
	this.processingUndoState = new Promise((done)=>{ undoFinishSignal = done; });
	//
	const isUndoOfBatchCommand = this._checkIsUndoOfBatchCommand(this.batch, this.commandStack);
	
//console.log(isUndoOfBatchCommand ? 2 : 1);
	
	const undoMode = (isUndoOfBatchCommand === false) ? "_undoSingleCommand" : "_undoBatchCommand";
	const res = await this[undoMode](this.commandStack, this.commands, this.batch);
	let {response, hasErrors} = res;
	
//console.log(4, hasErrors);	
	if(hasErrors) {
		response = Promise.reject(response);
		this.undoQueue = [];	
	}
	undoFinishSignal(true);
	this.processingUndoState = null;
	this.undoing = false;
	
	if(this.undoQueue.length > 0) {
		//async, called after return
		this._asyncProcessPendingUndos(this.undoQueue);
	}
	
	return response;
}

/// Clear execution data but keep command defintions
/// @function Undojs#reset
Undojs.prototype.reset = async function reset() {
	this.aborting = true;

	//preserve reference
	this.commandStack.splice(0, this.commandStack.length);
	this.batch = [];
	this.undoQueue = [];
	
	this.pendingUndos = 0;
	this.undoing = false;
	
	let hasErrors = false;
	
	try {
		await Promise.all(Object.values(this.processingCacheState));
	}
	catch(e) {
		hasErrors = true;
	}
		
	try {
		await this.processingUndoState;
	}
	catch(e) {
		hasErrors = true;
	}
	
	this.aborting = false;
	if(hasErrors) {
		this.processingCacheState = {};
		this.processingUndoState = null;
	}
}

/// Clear all data
/// @function Undojs#destroy
Undojs.prototype.destroy = async function destroy() {
	await this.reset();	
	this.commandNames = {};
	this.commands = [];
}

export default Undojs;