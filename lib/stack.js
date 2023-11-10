const {Construct} = require('constructs');
const {Stack} = require('aws-cdk-lib');
const {AccessS3ObjectsConstruct} = require('./construct');

// configure dotenv
require("dotenv").config()

class AccessS3ObjectsStack extends Stack {
    /**
     *
     * @param {Construct} scope
     * @param {string} id
     * @param {Object} props
     */
    constructor(scope, id, props) {
        super(scope, id, props);

        new AccessS3ObjectsConstruct(this, 'AccessS3ObjectsConstruct', props);
    }
}

module.exports = {AccessS3ObjectsStack}
