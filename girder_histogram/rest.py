#!/usr/bin/env python
# -*- coding: utf-8 -*-

###############################################################################
#  Girder plugin framework and tests adapted from Kitware Inc. source and
#  documentation by the Imaging and Visualization Group, Advanced Biomedical
#  Computational Science, Frederick National Laboratory for Cancer Research.
#
#  Copyright Kitware Inc.
#
#  Licensed under the Apache License, Version 2.0 ( the "License" );
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
###############################################################################

from bson.objectid import ObjectId

from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import filtermodel, Resource
from girder.constants import AccessType, TokenScope
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.item import Item
from girder.models.setting import Setting
# from girder_jobs.models.job import Job

from .constants import PluginSettings
from .models.histogram import Histogram


class HistogramResource(Resource):
    def __init__(self):
        super(HistogramResource, self).__init__()

        self.resourceName = 'histogram'

        self.route('GET', (), self.find)
        self.route('POST', (), self.createHistogram)
        self.route('DELETE', (':id',), self.deleteHistogram)
        self.route('GET', (':id',), self.getHistogram)
        self.route('GET', (':id', 'access'), self.getHistogramAccess)
        self.route('PUT', (':id', 'access'), self.updateHistogramAccess)
        self.route('GET', ('settings',), self.getSettings)

        self.histogram = Histogram()

    @access.public(scope=TokenScope.DATA_READ)
    @filtermodel(Histogram)
    @autoDescribeRoute(
        Description('Search for histograms.')
        .responseClass(Histogram, array=True)
        .param('itemId', 'The item ID of the histogram source.',
               required=False)
        .param('bins', 'Number of bins in in the histogram.', required=False,
               dataType='integer')
        .param('label', 'Histogram is of a label image.', required=False,
               dataType='boolean')
        .param('bitmask', 'Histogram is of a image with bitmask values.',
               required=False, dataType='boolean')
        .param('jobId', 'The job ID of the task generating the histogram.',
               required=False)
        .param('fileId', 'The file ID of the histogram file.', required=False)
        .pagingParams(defaultSort='_id')
        .errorResponse()
        .errorResponse('No matching histograms were found.', 404)
    )
    def find(self, itemId, bins, label, bitmask, jobId, fileId, limit, offset,
             sort):
        user = self.getCurrentUser()
        query = {}
        if itemId is not None:
            query['itemId'] = ObjectId(itemId)
        if bins is not None:
            query['bins'] = bins
        if label is not None:
            query['label'] = label
        if bitmask is not None:
            query['bitmask'] = bitmask
        if jobId is not None:
            query['jobId'] = ObjectId(jobId)
        if fileId is not None:
            query['fileId'] = ObjectId(fileId)
        return list(self.histogram.filterResultsByPermission(
            cursor=self.histogram.find(query, sort=sort),
            user=user,
            level=AccessType.READ,
            limit=limit, offset=offset
        ))

    @access.user(scope=TokenScope.DATA_WRITE)
    # @filtermodel(model='job', plugin='jobs')
    @filtermodel(Histogram)
    @autoDescribeRoute(
        Description('Create a new histogram from an item.')
        .modelParam('itemId', 'The ID of the source item.',
                    paramType='formData', model=Item, level=AccessType.WRITE)
        .param('fileId', 'The ID of the source file.', required=False)
        .param('notify', 'Trigger a notification when completed',
               required=False, dataType='boolean', default=False)
        .param('bins', 'Number of bins in the histogram', required=False,
               dataType='integer',
               # FIXME: update
               default=Setting().get(PluginSettings.DEFAULT_BINS))
        .param('label', 'Image is a label (ignore zero values)',
               required=False, dataType='boolean', default=False)
        .param('bitmask', 'Image label values are bitmasks',
               required=False, dataType='boolean', default=False)
    )
    def createHistogram(self, item, fileId, notify, bins, label, bitmask):
        user = self.getCurrentUser()
        token = self.getCurrentToken()
        if fileId is None:
            # files = list(Item().childFiles(item=item, limit=2))
            query = {
                'itemId': item['_id'],
                # 'mimeType': {'$regex': '^image/tiff'}
                # query should find the same file(tiff) used for creating histogram
                # but this will always find most recent json histogram
                '$or': [{'mimeType': {'$regex': '^image/'}},
                        {'mimeType': 'application/octet-stream'},
                        {'exts': ['tif']}],
            }
            files = list(File().find(query, limit=2))
            if len(files) >= 1:
                fileId = str(files[0]['_id'])
        if not fileId:
            raise RestException('Missing "fileId" parameter.')

        file_ = File().load(fileId, user=user, level=AccessType.READ, exc=True)
        return self.histogram.createHistogramJob(item, file_, user=user,
                                                 token=token, notify=notify,
                                                 bins=bins, label=label,
                                                 bitmask=bitmask)

    @access.user(scope=TokenScope.DATA_OWN)
    @filtermodel(Histogram)
    @autoDescribeRoute(
        Description('Delete a histogram.')
        .modelParam('id', model=Histogram, level=AccessType.WRITE)
        .errorResponse('ID was invalid.')
        .errorResponse('Write access was denied for the histogram.', 403)
    )
    def deleteHistogram(self, histogram):
        self.histogram.remove(histogram)

    @access.public(scope=TokenScope.DATA_READ)
    @filtermodel(Histogram)
    @autoDescribeRoute(
        Description('Get histogram by ID.')
        .responseClass(Histogram)
        .modelParam('id', model=Histogram, level=AccessType.READ)
        .errorResponse('ID was invalid.')
        .errorResponse('Read access was denied for the histogram.', 403)
    )
    def getHistogram(self, histogram):
        return histogram

    @access.user(scope=TokenScope.DATA_OWN)
    @filtermodel(Histogram)
    @autoDescribeRoute(
        Description('Get the access control list for a histogram.')
        .modelParam('id', model=Histogram, level=AccessType.ADMIN)
        .errorResponse('ID was invalid.')
        .errorResponse('Admin access was denied for the histogram.', 403)
    )
    def getHistogramAccess(self, histogram):
        return self.histogram.getFullAccessList(histogram)

    @access.user(scope=TokenScope.DATA_OWN)
    @filtermodel(Histogram)
    @autoDescribeRoute(
        Description('Update the access control list for a histogram.')
        .responseClass(Histogram)
        .modelParam('id', model=Histogram, level=AccessType.ADMIN)
        .jsonParam('access', 'The JSON-encoded access control list.')
        .param('public', 'Whether the histogram should be publicly visible.',
               dataType='boolean', required=False)
        .errorResponse('ID was invalid.')
        .errorResponse('Admin access was denied for the histogram.', 403)
    )
    def updateHistogramAccess(self, histogram, access, public):
        self.histogram.setPublic(histogram, public)
        return self.histogram.setAccessList(histogram, access, save=True,
                                            user=self.getCurrentUser())

    @access.public
    @autoDescribeRoute(
        Description('Getting histogram settings.')
    )
    def getSettings(self):
        settings = Setting()
        return {
            PluginSettings.DEFAULT_BINS:
                settings.get(PluginSettings.DEFAULT_BINS),
        }
