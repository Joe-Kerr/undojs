const packageJson = require("./package.json");

module.exports = function(env, argv) {

	const projectName = env;
	const projectRoot = (packageJson.name === "devenvbrowser") ? "./projects/" + projectName + "/" : "./" + projectName + "/";
	const project = projectRoot+"src/index.js";

	const path = require("path");
	const fs = require("fs");

	if(!fs.existsSync(project)) {
		console.error("Project not found: "+project);
		process.exit(1);
	}

	if(!fs.existsSync(projectRoot+"package.json")) {
		console.error("Package.json not found in project: "+projectRoot);
		process.exit(1);
	}

/////
const worker = {
			entry: path.join(__dirname, project),
			target: "webworker",
			output: {
				path: path.join(__dirname, projectRoot, "dist"),
				filename: projectName + ".worker.js",
				library: projectName,
				libraryTarget: "umd"
			},
			mode: "production"	
};
////	
	
	function config(target) {
		
		const abr = {
			"umd": "umd",
			"var": "browser",
			"commonjs2": "common"
		};
		
		return {
			entry: path.join(__dirname, project),
			output: {
				path: path.join(__dirname, projectRoot, "dist"),
				filename: projectName + "." + abr[target] + ".js",
				library: projectName,
				libraryTarget: target
			},
			mode: "production"
		}
	}

	return [config("umd"), config("var"), config("commonjs2"), worker]
}