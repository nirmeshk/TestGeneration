var obj = {
    allPossibleCases: function(arr) {
        /*
        Reference: http://stackoverflow.com/questions/4331092/finding-all-combinations-of-javascript-array-values
        */
        
        if (arr.length == 1) {
            return arr[0];
        } else {
            var result = [];
            var allCasesOfRest = obj.allPossibleCases(arr.slice(1)); 
            for (var i = 0; i < allCasesOfRest.length; i++) {
                for (var j = 0; j < arr[0].length; j++) {
                    result.push([arr[0][j]].concat(allCasesOfRest[i]));
                }
            }
            return result;
        }
    }
}

module.exports = obj