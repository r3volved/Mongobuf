async function run( protoFile, mongoStr ) {
	
	try {
		
		console.info('');
		
		//Check for input
		if( !protoFile ) { throw new Error('! Please specify a .proto file'); }
		mongoStr = "mongodb://localhost/"+(mongoStr || '');
		
		//Add full path
		protoFile = __dirname+"/"+protoFile.replace('.proto','');
		protoFile += ".proto";
		
		const fs = require('fs');
		try {
			//Check if input file exists
			if( !await fs.existsSync(protoFile) ) { throw new Error('! Could not find file '+protoFile); }
			console.info('+ File located: '+protoFile);
		} catch(e) { throw e; }
		
		
		let rawProtoFile = null;
		try {
			rawProtoFile = await fs.readFileSync( protoFile );
			if( !rawProtoFile || rawProtoFile.length === 0 ) { throw new Error('! Could not read file '+protoFile); }
			console.info('+ Read complete');
		} catch(e) { throw e; }
		
		let blocks 	 = rawProtoFile.toString().split('\n\n');

		console.info("-".repeat(48));
		console.log('+ Found '+blocks.length+' blocks');
		
		let messages = [];
		let enums = [];
		
		for( let b = 0; b < blocks.length; ++b ) {
			
			if( blocks[b].match(/^(message\s(\w|[^\}])*(\s*\})*)$/g) ) { messages.push(blocks[b]); }
			if( blocks[b].match(/^(enum\s(\w|[^\}])*(\s*\})*)$/g) ) { enums.push(blocks[b]); } 
		
		}
		
		/** Collect enums **/
		console.log('+ Found '+enums.length+' enums');
		let enumList = new Map;		
		for( let e = 0; e < enums.length; ++e ) {
			
			let lines = enums[e].split('\n');
			let name = lines[0].replace(/(enum|\s|{)*/g,'');
			
			let values = [];
			for( let f = 1; f < lines.length -1; ++f ) {
				values.push( lines[f].split(/=/g)[0].trim() );
			}	
			enumList.set( name, values );
			
		}
		
		/** Collect messages **/
		console.log('+ Found '+messages.length+' messages');

		try {
			if( !await fs.existsSync(__dirname+"/models/") ) {
				await fs.mkdirSync(__dirname+"/models/");
				console.info('+ Created new folder '+__dirname+"/models/");
			}
		} catch(e) { throw e; }
		
		let index = [];
		let responses = [];
		let depends = []; 
		
		let dependencies = new Map();
		let keyIndex = {};
		
		for( let m = 0; m < messages.length; ++m ) {
			
			let lines = messages[m].split('\n');
			let name = lines[0].replace(/(message|\s|{)*/g,'');
			
			let model = "";
			
			model += "const mongoose = require(\"mongoose\");\n";
			model += "const conn = mongoose.createConnection('"+mongoStr+"');\n\n";
			model += "// Save a reference to the Schema constructor\n";
			model += "const Schema = mongoose.Schema;\n\n";
			model += "// Using the Schema constructor, create a new "+name+"Schema object\n";
			model += "// This is similar to a Sequelize model\n";
			model += "let "+name+"Schema = new Schema({\n";

			let dependent = [];
			
			//Append fields
			for( let f = 1; f < lines.length -1; ++f ) {
				
				let field = lines[f].split(';')[0].trim();
				let fieldStr = "    ";
				let fpcs = field.split(/=/)[0].trim().split(/\s/);
				
				let fname = null;
				let ftype = null;
				let repeat = false;
				
				if( fpcs.length === 2 ) {
					fname = fpcs[1];
					ftype = fpcs[0];
				} else {
					fname = fpcs[2];
					ftype = fpcs[1];
					repeat = true;
				}
				
				//Camel-hump field name
				if( fname.match(/_/g) ) {
					let fnp = fname.split(/_/g);
					fname = fnp[0];
					for( let p of fnp.slice(1) ) {
						fname += p[0].toUpperCase()+p.slice(1);
					}
				}
				
				ftype = typeFormat( ftype, enumList ); 
				fname = fname+(repeat ? "List" : "");
				keyIndex[fname] = ftype;
				
				//If type is a schema, add to dependencies
				if( ftype.includes('Schema') ) {
					dependent.push(ftype.replace('Schema',''));
				}
				
				//If name is ID then this is a primary key
//				if( fname === "id" ) {
//					if( enumList.get(ftype) ) {
//						enumStr = enumList.get(ftype).join("', '");
//						ftype = "{\n        type: Number,\n        enum: [ '"+enumStr+"' ],\n        index:true,\n        unique:true\n    }";
//					} else {
//						ftype = "{ type: "+ftype+", index: true, unique: true }";
//					}
//				}

				//If enum, make enum field
				if( enumList.get(ftype) ) {
					enumStr = enumList.get(ftype).join("', '");
					ftype = "{\n        type: Number,\n        enum: [ '"+enumStr+"' ]\n    }";
				}
				
				if( repeat ) {
					if( ftype.includes('Schema') ) {
						ftype = "{\n        type: [ Schema.Types.ObjectId ],\n        ref: \""+ftype.replace("Schema","")+"\"\n    }"; 
					} else {
						ftype = "[ "+ftype+" ]";
					}
				}
				
				if( ftype.endsWith("Schema") ) { ftype = "{\n        type: Schema.Types.ObjectId,\n        ref: \""+ftype.replace("Schema","")+"\"\n    }" }
				fieldStr += fname+": "+ftype;
				model += fieldStr+",\n";
				
			}
			model += "    fetched:{ type:Date, default:Date.now }\n"
			model += "});\n\n";			
			model += "// This creates our model from the above schema, using mongoose's model method\n";
			model += "let "+name+" = conn.model(\""+name+"\", "+name+"Schema);\n\n";
			model += "// Export the "+name+" model\n";
			model += "module.exports = "+name+";\n\n";
			
			dependencies.set( name, dependent ); 
			
			try {
				await fs.writeFileSync(__dirname+'/models/'+name+'.js', model);				
				if( dependencies.get(name).length > 0 ) {
					depends.push(name);
				} else {
					index.push(name);
				}
			} catch(e) { throw e; }
			
		}

		console.info("-".repeat(48));
		console.info("+ "+index.length+" non-dependent models created");
		console.info("+ "+depends.length+" dependent models created");
		console.info("-".repeat(48));
		
		index = index.concat(depends);
				
		console.info("+ "+index.length+" total models created");
		
		let sorted = await sortDependencies( index, dependencies ); 

		let indexStr = "// Exporting an object containing all of our models\n";
		indexStr += "module.exports = {\n";
				
		for( let ids = 0; ids < sorted.length; ++ids ) {
			indexStr += "    "+sorted[ids]+": require('./"+sorted[ids]+"')";
			indexStr += ",\n";
		}			
		
		if( indexStr.endsWith(',\n') ) { 
			indexStr = indexStr.substr(0, indexStr.length-2)+"\n";
		}
		indexStr += "};\n\n"
	
		try {
			await fs.writeFileSync(__dirname+'/models/index.js', indexStr);
			await fs.writeFileSync(__dirname+'/models/index.json', JSON.stringify(keyIndex,""," "));
			console.info('+ Created index');
		} catch(e) { throw e; }

		console.info("\n++ Complete ++\n");

	} catch(err) {
		console.error(err);
		console.info("Usage:\nnode index <fileName> [dbName]");
	}
}

async function sortDependencies( arr, map ) {
	let sorted = arr;
	
	for( let i = 0; i < arr.length; ++i ) {
		
		//Add parent
		//console.log( arr[i] );
		if( sorted.indexOf(arr[i]) < 0 ) { sorted.push( arr[i] ); }
		
		let children = map.get(arr[i]);
		if( children.length === 0 ) { sorted = await inject( sorted, 0, arr[i] ); }
		else {
			for( let ai = 0; ai < children.length; ++ai ) {
				let pIndex = sorted.indexOf(arr[i]); 		//Index of parent
				let cIndex = sorted.indexOf(children[ai]);	//Index of child
				
				//If childIndex is after parent
				if( cIndex < 0 || cIndex >= pIndex ) {
					sorted = await inject( sorted, pIndex, children[ai] );
				}
			}
		}
		
	}
	
	return sorted;
}


async function inject( array, index, value ) {	
	let ogi = array.indexOf( value );
	if( ogi >= 0 ) { array.splice(ogi,1); }
	
	let arrStart = array.slice(0,index) || [];
	let arrEnd = array.slice(index) || [];
	arrStart.push( value );	
	
	return arrStart.concat(arrEnd);	
}

function typeFormat( ftype, enumList ) {
	switch( ftype ) {
		case "time":
		case "date":
		case "datetime":
			ftype = "Date";
			break;
		case "bytes":
			ftype = "Buffer";
			break;
		case "bool":
			ftype = "Boolean";
			break;
		case "sint32":
		case "sint64":
		case "uint32":
		case "uint64":
		case "int32":
		case "int64":
		case "float":
		case "double":
			ftype = "Number";
			break;
		case "string":
			ftype = ftype[0].toUpperCase()+ftype.slice(1);
			break;
		default:
			if( ftype.startsWith("[") ) { break; }
			if( enumList.get(ftype) ) { break; }
			ftype = ftype+"Schema";
	}
	return ftype;
}

run( (process.argv[2] || null), (process.argv[3] || null) );
