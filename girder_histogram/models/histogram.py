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

import json
import os.path
import uuid


from girder.constants import AccessType
from girder.models.model_base import AccessControlledModel
from girder.models.file import File
from girder.models.setting import Setting

from girder_jobs.models.job import Job
from girder_worker.girder_plugin import utils

from ..constants import PluginSettings

from girder_worker_utils.transforms.girder_io import GirderFileId, GirderUploadToItem
from histogram.histogram import histogram as histogramExecutor


class Histogram(AccessControlledModel):
    def initialize(self):
        self.name = 'histogram'
        self.ensureIndices(['itemId', 'fakeId', 'fileId'])
        self.exposeFields(AccessType.READ, (
            '_id',
            'itemId',  # computed histogram of this item
            'bins',
            'label',
            'bitmask',
            'fakeId',
            'fileId',  # file containing computed histogram
        ))

    def remove(self, histogram, **kwargs):
        if not kwargs.get('keepFile'):
            fileId = histogram.get('fileId')
            if fileId:
                file_ = File().load(fileId, force=True)
                if file_:
                    File().remove(file_)
        return super(Histogram, self).remove(histogram, **kwargs)

    def createHistogramJob(self, item, file_, user=None, token=None,
                           notify=False, bins=None, label=False, bitmask=False):
        if bins is None:
            bins = Setting().get(PluginSettings.DEFAULT_BINS)
        if file_['itemId'] != item['_id']:
            raise ValueError('The file must be in the item.')
        girder_job_title = 'Histogram computation for item %s' % item['_id']
        girder_job_type = 'histogram'
        fakeId = uuid.uuid4().hex
        other_fields = {
            'meta' : {
                'creator': 'histogram',
                'task': 'createHistogram',
                'fakeId': fakeId,
            }
        }
        reference = json.dumps({'isHistogram': True, 'fakeId': fakeId})
        result = histogramExecutor.delay(GirderFileId(str(file_['_id'])), label, bins, bitmask,
                                         girder_job_title=girder_job_title, girder_job_type=girder_job_type,
                                         girder_job_other_fields=other_fields,
                                         girder_result_hooks=[GirderUploadToItem(str(item['_id']), delete_file=True,
                                         upload_kwargs={'reference': reference})])
        histogram = {
            'expected': True,
            'notify': True,
            'itemId': item['_id'],
            'bins': bins,
            'label': label,
            'bitmask': bitmask,
            # 'jobId': result.job['_id'],
            'fakeId': fakeId
        }
        self.save(histogram)
        return histogram
        # path = os.path.join(os.path.dirname(__file__), '../../histogramScript/',
        #                     'create_histogram.py')
        # with open(path, 'r') as f:
        #     script = f.read()

        # title = 'Histogram computation for item %s' % item['_id']
        # job = Job().createJob(title=title, type='histogram',
        #                       handler='worker_handler', user=user)
        # jobToken = Job().createJobToken(job)

        # task = {
        #     'mode': 'python',
        #     'script': script,
        #     'name': title,
        #     'inputs': [{
        #         'id': 'in_path',
        #         'target': 'filepath',
        #         'type': 'string',
        #         'format': 'text'
        #     }, {
        #         'id': 'bins',
        #         'type': 'number',
        #         'format': 'number',
        #     }, {
        #         'id': 'label',
        #         'type': 'boolean',
        #         'format': 'boolean',
        #     }, {
        #         'id': 'bitmask',
        #         'type': 'boolean',
        #         'format': 'boolean',
        #     }],
        #     'outputs': [{
        #         'id': 'histogram',
        #         'target': 'memory',
        #         'type': 'string',
        #         'format': 'text',
        #     }],
        # }

        # inputs = {
        #     'in_path': utils.girderInputSpec(
        #         file_, resourceType='file', token=token),
        #     'bins': {
        #         'mode': 'inline',
        #         'type': 'number',
        #         'format': 'number',
        #         'data': bins,
        #     },
        #     'label': {
        #         'mode': 'inline',
        #         'type': 'boolean',
        #         'format': 'boolean',
        #         'data': label,
        #     },
        #     'bitmask': {
        #         'mode': 'inline',
        #         'type': 'boolean',
        #         'format': 'boolean',
        #         'data': bitmask,
        #     },
        # }
        # reference = json.dumps({'jobId': str(job['_id']), 'isHistogram': True})
        # outputs = {
        #     'histogram': utils.girderOutputSpec(item, token,
        #                                         parentType='item',
        #                                         name='histogram.json',
        #                                         reference=reference),
        # }

        # job['kwargs'] = {
        #     'task': task,
        #     'inputs': inputs,
        #     'outputs': outputs,
        #     'jobInfo': utils.jobInfoSpec(job, jobToken),
        #     'auto_convert': True,
        #     'validate': True,
        # }

        # job['meta'] = {
        #     'creator': 'histogram',
        #     'task': 'createHistogram',
        # }

        # job = Job().save(job)

        # histogram = {
        #     'expected': True,
        #     'notify': notify,
        #     'itemId': item['_id'],
        #     'bins': bins,
        #     'label': label,
        #     'bitmask': bitmask,
        #     'jobId': job['_id'],
        # }
        # self.save(histogram)

        # Job().scheduleJob(job)

        # return job

    def validate(self, histogram):
        return histogram
