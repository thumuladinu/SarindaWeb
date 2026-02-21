const webpush = require('web-push');

// Generate these once using: npx web-push generate-vapid-keys
const publicVapidKey = 'BFJGcJs3zH5JigFKbeWomDRIyERD4ea7RcDIdb-kNEg7djAEsBbg1mLa168kY4DsZFfdoqPHyncEiM62KRWWt9A';
const privateVapidKey = 'bifWGRqE9Kn_dU5Xl5tleULqc-iqZauDcbopAMa0StY';

webpush.setVapidDetails(
    'mailto:test@example.com',
    publicVapidKey,
    privateVapidKey
);

module.exports = webpush;
