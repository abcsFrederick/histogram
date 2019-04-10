import Collection from 'girder/collections/Collection';

import HistogramModel from '../models/HistogramModel';

export default Collection.extend({
    resourceName: 'histogram',
    model: HistogramModel
});
