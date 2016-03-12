var _ = require("underscore");
var path = require("path");
var Engine = require("tingodb")(); // Mongo-Style Database
var cnchars = require('cn-chars'); // Convert between tradtitional and simplified
var pinyin = require('prettify-pinyin'); // Prettify the pinyin default (letter + numbers) in CC-CEDICT
var SimpleHashTable = require('simple-hashtable'); // Hash table to store values of chinese charactesr and their "word object"

// Initialize the TingoDB that is storing the dictionary information
var db = new Engine.Db("./src/node-cc-cedict/db/cc-cedict-tingodb", {});
var cedict = db.collection('words');

// Create global hashtables that are going to serve as the lookup method for search
// Using the hashtables over just a database query will dramatically incrase the speed
window.simpHashtable = new SimpleHashTable();	// Hashtable containing all simplified characters as key and their "word object" as the value
window.tradHashtable = new SimpleHashTable();	// Hashtable containing all traditional characters as key and their "word object" as the value
window.pinyinHashtable = new SimpleHashTable();	// Hashtable containing all pinyin that could be input as key, and their "word object" as the value

// Ensure that the database has been setup on this build
cedict.count(function(err, count) {
	if(err || count == undefined || count == null) {
		console.log("There was an error while getting the count of the database.");
		console.log(err);
		// TODO: Report the error to the user.
	}
	if(count == 0) {
		// Open Loading Dialog so that the user can not search until the dictionary has been initialized
		$("#search-results").openModal();

		// Load the CC-CEDICT file into the database from a JSON BLOB that was converted from a CSV, which was convereted from a .u8 (CC-CEDICT file)
		$.getJSON("../src/node-cc-cedict/db/cc-cedict.json", function(data) {
			cedict.insert(data, {w:1}, function(err, result) {
				if(err || result == undefined || result == null) {
					console.log("There was an error while updating the database with the dictionary.");
					console.log(err);
					// TODO: Report the error to the user.
				}
				else {
					$("#search-results").closeModal();
				}
			});
		});
	}
});

// Check to see if the hashtables have been created and populated yet.
if(tradHashtable.isEmpty() || simpHashtable.isEmpty()) {
	// Open the loading dialog so the user can't search until the dictionary is initalized
	$("#search-results").openModal();

	cedict.find().toArray(function(err, wordList) {
		if(err || wordList == undefined || wordList == null) {
			console.log("There was an error getting all the database entires.");
			console.log(err);
			// TODO: Report this issue to the user.
		}
		else {
			var tradIsEmpty = tradHashtable.isEmpty();
			var simpIsEmpty = simpHashtable.isEmpty();
			var pinyinIsEmpty = pinyinHashtable.isEmpty();

			for(var i = 0; i < wordList.length; i++) {
				if(pinyinIsEmpty == true) {
					function runPinyin() {
						'use strict'

						// "Copy" the object, so that changes made won't reflect globally on the wordList array
						let word = {
							simplified: wordList[i].simplified,
							traditional: wordList[i].traditional,
							pronunciation: wordList[i].pronunciation,
							definitions: wordList[i].definitions
						};

						// Searchable pinyin without tone numbers
						let searchablePinyin = word.pronunciation.substring(1, word.pronunciation.length - 1).replace(/[0-9]/g, '').replace(/\s+/g, '');

						// Prettify the pinyin to use tone marks instead of tone numbers
						word.pronunciation = pinyin.prettify(word.pronunciation.substring(1, word.pronunciation.length - 1));

						// Add the word to the hashtable, if the character already exists in the hashtable as a key, add the second definition to the same key
						if(pinyinHashtable.containsKey(searchablePinyin) == false) {
							let addWord = [];
							addWord.push(word);
							pinyinHashtable.put(searchablePinyin, addWord);
						}
						else {
							let addWord = pinyinHashtable.get(searchablePinyin);
							addWord.push(word);
							pinyinHashtable.put(searchablePinyin, addWord);
						}
					}

					runPinyin();
				}
				if(tradIsEmpty == true) {
					function runTraditional() {
						'use strict'

						// "Copy" the object, so that changes made won't reflect globally on the wordList array
						let word = {
							simplified: wordList[i].simplified,
							traditional: wordList[i].traditional,
							pronunciation: wordList[i].pronunciation,
							definitions: wordList[i].definitions
						};

						// Prettify the pinyin to use tone marks instead of tone numbers
						word.pronunciation = pinyin.prettify(word.pronunciation.substring(1, word.pronunciation.length - 1));

						// Add the word to the hashtable, if the character already exists in the hashtable as a key, add the second definition to the same key
						if(tradHashtable.containsKey(word.traditional) == false) {
							let addWord = [];
							addWord.push(word);
							tradHashtable.put(word.traditional, addWord);
						}
						else {
							let addWord = tradHashtable.get(word.traditional);
							addWord.push(word);
							tradHashtable.put(word.traditional, addWord);
						}
					}

					runTraditional();
				}
				if(simpIsEmpty == true) {
					function runSimplified() {
						'use strict'

						// "Copy" the object, so that changes made won't reflect globally on the wordList array
						let word = {
							simplified: wordList[i].simplified,
							traditional: wordList[i].traditional,
							pronunciation: wordList[i].pronunciation,
							definitions: wordList[i].definitions
						};

						// Prettify the pinyin to use tone marks instead of tone numbers
						word.pronunciation = pinyin.prettify(word.pronunciation.substring(1, word.pronunciation.length - 1));

						// Add the word to the hashtable, if the character already exists in the hashtable as a key, add the second definition to the same key
						if(simpHashtable.containsKey(word.simplified) == false) {
							var addWord = [];
							addWord.push(word);
							simpHashtable.put(word.simplified, addWord);
						}
						else {
							var addWord = simpHashtable.get(word.simplified);
							addWord.push(word);
							simpHashtable.put(word.simplified, addWord);
						}
					}

					runSimplified();
				}
			}

			// Close the loading dialog so that the user can now search
			$("#search-results").closeModal();
		}
	});
}

// Search using Chinese Characters (both simplified and traditional)
module.exports.searchByChinese = function(str, cb) {
	function searchByTraditional(trad, callback) {
		var compounds = [];	// Put all the compound words into this array so they can be searched as compound words
		var infiniteCheck = 0;	// Max the search out at 4000 loops, so that in case none of the characters in the input are found we don't run into an infinite loop
		while(trad.length > 0 && infiniteCheck < 4000) {
			// Check for 4, 3, and 2 character compound words
			if(trad.length >= 4 && tradHashtable.containsKey(trad.substring(0, 4))) {
				var compoundWord = tradHashtable.get(trad.substring(0, 4));
				compounds.push(compoundWord);
				trad = trad.substring(4);
			}
			else if(trad.length >= 3 && tradHashtable.containsKey(trad.substring(0, 3))) {
				var compoundWord = tradHashtable.get(trad.substring(0, 3));
				compounds.push(compoundWord);
				trad = trad.substring(3);
			}
			else if(trad.length >= 2 && tradHashtable.containsKey(trad.substring(0, 2))) {
				var compoundWord = tradHashtable.get(trad.substring(0, 2));
				compounds.push(compoundWord);
				trad = trad.substring(2);
			}
			else if(trad.length >= 1 && tradHashtable.containsKey(trad.substring(0, 1))) {
				var compoundWord = tradHashtable.get(trad.substring(0, 1));
				compounds.push(compoundWord);
				trad = trad.substring(1);
			}
			else {
				// The character wasn't recognized at all
				console.log("The character wasn't recognized");
				console.log(trad.substring(0, 1));
			}

			infiniteCheck++;
		}
		callback(compounds);
	}

	function searchBySimplified(simp, callback) {
		var compounds = [];	// Put all the compound words into this array so they can be searched as compound words
		var infiniteCheck = 0;	// Max the search out at 4000 loops, so that in case none of the characters in the input are found we don't run into an infinite loop
		while(simp.length > 0 && infiniteCheck < 4000) {
			// Check for 4, 3, and 2 character compound words
			if(simp.length >= 4 && simpHashtable.containsKey(simp.substring(0, 4))) {
				var compoundWord = simpHashtable.get(simp.substring(0, 4));
				compounds.push(compoundWord);
				simp = simp.substring(4);
			}
			else if(simp.length >= 3 && simpHashtable.containsKey(simp.substring(0, 3))) {
				var compoundWord = simpHashtable.get(simp.substring(0, 3));
				compounds.push(compoundWord);
				simp = simp.substring(3);
			}
			else if(simp.length >= 2 && simpHashtable.containsKey(simp.substring(0, 2))) {
				var compoundWord = simpHashtable.get(simp.substring(0, 2));
				compounds.push(compoundWord);
				simp = simp.substring(2);
			}
			else if(simp.length >= 1 && simpHashtable.containsKey(simp.substring(0, 1))) {
				var compoundWord = simpHashtable.get(simp.substring(0, 1));
				compounds.push(compoundWord);
				simp = simp.substring(1);
			}
			else {
				// The character wasn't recognized
				console.log("The character wasn't recognized");
				console.log(trad.substring(0, 1));
			}

			infiniteCheck++;
		}

		callback(compounds);
	}

	// Convert characters to Simplified and Traditional in-case of input that contains both Traditional and Simplified
	var simplified = str.slice().split("");
	var traditional = str.slice().split("");

	for(var i = 0; i < str.length; i++) {
		simplified[i] = cnchars.toSimplifiedChar(str[i]);
		traditional[i] = cnchars.toTraditionalChar(str[i]);
	}

	simplified = simplified.join('');
	traditional = traditional.join('');

	// Search the traditional hashtable if the input was explicitly in tradtitional, otherwise search simplified
	if(traditional === str) {
		// Remove punctuation and whitespaces
		traditional = traditional.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
		traditional = traditional.replace(/[\$\uFFE5\^\+=`~<>{}\[\]|\u3000-\u303F!-#%-\x2A,-/:;\x3F@\x5B-\x5D_\x7B}\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E3B\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]+/g, "");
		traditional = traditional.replace(" ", "");

		searchByTraditional(traditional, function(res) { cb(res); });
	}
	else {
		// Remove puncuation and whitespace
		simplified = simplified.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
		simplified = simplified.replace(/[\$\uFFE5\^\+=`~<>{}\[\]|\u3000-\u303F!-#%-\x2A,-/:;\x3F@\x5B-\x5D_\x7B}\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E3B\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]+/g, "");
		simplified = simplified.replace(" ", "");

		searchBySimplified(simplified, function(res) { cb(res); });
	}
};

// Search by pinyin
/*
*	TODO: Make pinyin searchable WITH tone numbers
*		DESC: The input 'ni2hao3' and 'nihao' should both return results containing the character 你好
*/
module.exports.searchByPinyin = function(str, cb) {
	// Convert querty to space separated array
	str = str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
	str = str.replace(/[\$\uFFE5\^\+=`~<>{}\[\]|\u3000-\u303F!-#%-\x2A,-/:;\x3F@\x5B-\x5D_\x7B}\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E3B\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]+/g, "");
	pinyin = str.split(" ");

	var results = [];
	var i = 0;
	var infiniteCheck = 0;
	while(i < pinyin.length && infiniteCheck < 4000) {
		if(pinyinHashtable.containsKey(pinyin[i])) {
			results.push(pinyinHashtable.get(pinyin[i]));
		}
		else {
			console.log("Error: Could not find "+pinyin[i]+" in the database.");
			/*
			* TODO: Report this error to the user.
			*/
		}

		infiniteCheck++;
		i++;
	}

	cb(results);
};

/*
*	TODO: Write this function
*/
module.exports.searchByEnglish = function(str, cb) {}
