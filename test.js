function run() {
	let obj = [ "GarageRequest", "Garage", "Car", "Truck", "Owner", "DriveRequest", "Road" ]
	let sorted = [];

	let map = new Map();
	map.set( "GarageRequest", [ "Garage" ] );
	map.set( "Garage", [ "Car", "Truck" ] );
	map.set( "Car", [ "Owner" ] );
	map.set( "Truck", [ "Owner" ] );
	map.set( "Owner", [] );
	map.set( "DriveRequest", [ "Road" ] );
	map.set( "Road", [ "Car", "Truck" ] );
	

	sorted = sortDependencies( obj, map );
		
	console.log( "\n[OG]\n", obj );
	console.log( "\n[Map]\n", map );
	console.log( "\n[Sorted]\n", sorted );	
}


function sortDependencies( arr, map ) {
	let sorted = [];
	for( let i = 0; i < arr.length; ++i ) {
		
		//Add parent
		if( sorted.indexOf(arr[i]) < 0 ) { sorted.push( arr[i] ); }
		
		let children = map.get(arr[i]);
		if( children.length === 0 ) { sorted = inject( sorted, 0, arr[i] ); }
		else {
			for( let ai = 0; ai < children.length; ++ai ) {
				let pIndex = sorted.indexOf(arr[i]);
				let cIndex = sorted.indexOf(children[ai]);
				if( cIndex < 0 || cIndex > pIndex ) {
					sorted = inject( sorted, pIndex, children[ai] );
				}
			}
		}
		
	}
	return sorted;
}


function inject( array, index, value ) {	
	let ogi = array.indexOf( value );
	if( ogi >= 0 ) { array.splice(ogi,1); }
	
	let arrStart = array.slice(0,index) || [];
	let arrEnd = array.slice(index) || [];
	arrStart.push( value );	
	
	return arrStart.concat(arrEnd);	
}

run();