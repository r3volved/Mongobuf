async function run( protoFile, mongoStr ) {
	
	try {
		
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

		console.log('+ Found '+blocks.length+' blocks');
		
		let messages = [];
		let enums = [];
		
		for( let b = 0; b < blocks.length; ++b ) {
			
			if( blocks[b].match(/^(message\s(\w|[^\}])*(\s*\})*)$/gi) ) { messages.push(blocks[b]); }
			if( blocks[b].match(/^(enum\s(\w|[^\}])*(\s*\})*)$/gi) ) { enums.push(blocks[b]); } 
		
		}
		
		/** Collect enums **/
		console.log('+ Found '+enums.length+' enums');
		let enumList = new Map;		
		for( let e = 0; e < enums.length; ++e ) {
			
			let lines = enums[e].split('\n');
			let name = lines[0].replace(/(enum|\s|{)*/gi,'');
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
		
		for( let m = 0; m < messages.length; ++m ) {
			
			let lines = messages[m].split('\n');
			let name = lines[0].replace(/(message|\s|{)*/gi,'');
			let model = "";
			
			model += "var mongoose = require(\"mongoose\");\n";
			model += "var conn = mongoose.createConnection('"+mongoStr+"');\n\n";
			model += "// Save a reference to the Schema constructor\n";
			model += "var Schema = mongoose.Schema;\n\n";
			model += "// Using the Schema constructor, create a new "+name+"Schema object\n";
			model += "// This is similar to a Sequelize model\n";
			model += "var "+name+"Schema = new Schema({\n";

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
					reprat = true;
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
				
				if( fname === "id" ) {
					ftype = "{ type: "+ftype+", index: true, unique: true }";
				}

				if( enumList.get(ftype) ) {
					enumStr = enumList.get(ftype).join("', '");
					ftype = "{\n        type: String,\n        enum: [ '"+enumStr+"' ]\n    }";
				}
				
				fieldStr += fname+": "+ftype;
				model += fieldStr+",\n";
				
			}
			model += "    fetched:{ type:Date, default:Date.now }\n"
			model += "});\n\n";			
			model += "// This creates our model from the above schema, using mongoose's model method\n";
			model += "var "+name+" = conn.model(\""+name+"\", "+name+"Schema);\n\n";
			model += "// Export the "+name+" model\n";
			model += "module.exports = "+name+";\n\n";
			
			
			try {
				await fs.writeFileSync(__dirname+'/models/'+name+'.js', model);
			} catch(e) { throw e; }
			
			if( m < 30 ) {
				console.log( name );
				
			}
			
		}
		
	} catch(err) {
		console.error(err);
		console.info("Usage:\nnode index <fileName> [dbName]");
	}
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
		case "int32":
		case "int64":
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
