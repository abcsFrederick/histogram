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

import datetime
import json

from bson.objectid import ObjectId

from girder import plugin
from girder import events, logger
from girder.settings import SettingDefault
from girder.exceptions import ValidationException
from girder.models.item import Item
from girder.models.notification import Notification
from girder.utility import setting_utilities

from girder_jobs.constants import JobStatus
from girder_jobs.models.job import Job

from .constants import PluginSettings
from .rest import HistogramResource
from .models.histogram import Histogram
from girder.utility.model_importer import ModelImporter


def _onRemoveItem(event):
    """
    When a resource containing histograms is about to be deleted, we delete
    all of the histograms that are attached to it.
    """
    histogramModel = Histogram()
    for histogram in Histogram().find({'itemId': ObjectId(event.info['_id'])}):
        histogramModel.remove(histogram)


def _onRemoveFile(event):
    """
    When a histogram file is deleted, we remove the parent histogram.
    """
    histogramModel = Histogram()
    for histogram in Histogram().find({'fileId': ObjectId(event.info['_id'])}):
        histogramModel.remove(histogram, keepFile=True)


def _onUpload(event):
    """
    Histogram creation can be requested on file upload by passing a reference
    'histogram' that is a JSON object of the following form:

        {
          "histogram": {
            "bins": 255,
            "label": True,
            "bitmask": False
          }
        }

    bins, label, and bitmask arguments are optional
    """
    file_ = event.info['file']
    user = event.info['currentUser']
    token = event.info['currentToken']
    if 'itemId' not in file_:
        return

    try:
        ref = json.loads(event.info.get('reference', ''))
    except (TypeError, ValueError):
        return

    if not isinstance(ref, dict):
        return

    if ref.get('isHistogram'):
        # jobId = ref.get('jobId')
        fakeId = ref.get('fakeId')
        if not fakeId:
            msg = 'Histogram file %s uploaded without fakeId reference.'
            logger.warning(msg % file_['_id'])
            return
        histograms = list(Histogram().find({'fakeId': fakeId}, limit=2))
        if len(histograms) == 1:
            histogram = histograms[0]
            del histogram['expected']
            histogram['fileId'] = file_['_id']
            Histogram().save(histogram)
        else:
            msg = 'Failed to retrieve histogram for file %s using fakeId %s.'
            logger.warning(msg % (file_['_id'], fakeId))
            return
    elif isinstance(ref.get('histogram'), dict):
        item = Item().load(file_['itemId'], force=True)
        Histogram().createHistogram(item, file_, user, token,
                                    **ref['histogram'])


def _updateJob(event):
    """
    Called when a job is saved, updated, or removed.  If this is a histogram
    job and it is ended, clean up after it.
    """
    if event.name == 'jobs.job.update.after':
        job = event.info['job']
    else:
        job = event.info
    meta = job.get('meta', {})
    if (meta.get('creator') != 'histogram' or
            meta.get('task') != 'createHistogram'):
        return
    status = job['status']
    if event.name == 'model.job.remove' and status not in (
            JobStatus.ERROR, JobStatus.CANCELED, JobStatus.SUCCESS):
        status = JobStatus.CANCELED
    if status not in (JobStatus.ERROR, JobStatus.CANCELED, JobStatus.SUCCESS):
        return
    histograms = list(Histogram().find({'fakeId': meta.get('fakeId')}, limit=2))
    if len(histograms) != 1:
        msg = 'Failed to retrieve histogram using fakeId %s.'
        logger.warning(msg % meta.get('fakeId'))
        return
    histogram = histograms[0]
    if histogram.get('expected'):
        # We can get a SUCCESS message before we get the upload message, so
        # don't clear the expected status on success.
        if status != JobStatus.SUCCESS:
            del histogram['expected']
    notify = histogram.get('notify')
    msg = None
    if notify:
        del histogram['notify']
        if status == JobStatus.SUCCESS:
            msg = 'Histogram created'
        elif status == JobStatus.CANCELED:
            msg = 'Histogram creation canceled'
        else:  # ERROR
            msg = 'FAILED: Histogram creation failed'
        msg += ' for item %s' % histogram['itemId']
        msg += ', file %s' % histogram['fileId']
    if status == JobStatus.SUCCESS:
        Histogram().save(histogram)
    else:
        Histogram().remove(histogram)
    if msg and event.name != 'model.job.remove':
        Job().updateJob(job, progressMessage=msg)
    if notify:
        Notification().createNotification(
            type='histogram.finished_histogram',
            data={
                'histogram_id': histogram['_id'],
                'item_id': histogram['itemId'],
                'file_id': histogram['fileId'],
                'job_id': histogram['jobId'],
                'success': status == JobStatus.SUCCESS,
                'status': status
            },
            user={'_id': job.get('userId')},
            expires=datetime.datetime.utcnow() + datetime.timedelta(seconds=30)
        )


@setting_utilities.validator({
    PluginSettings.DEFAULT_BINS,
})
def validateNonnegativeInteger(doc):
    val = doc['value']
    try:
        val = int(val)
        if val < 0:
            raise ValueError
    except ValueError:
        msg = '%s must be a non-negative integer.' % doc['key']
        raise ValidationException(msg, 'value')
    doc['value'] = val


# Default settings values
SettingDefault.defaults.update({
    PluginSettings.DEFAULT_BINS: 256,
})

class HistogramPlugin(plugin.GirderPlugin):
    DISPLAY_NAME = 'Histogram'
    CLIENT_SOURCE_PATH = 'web_client'
    def load(self, info):
        ModelImporter.registerModel('histogram', Histogram, 'histogram')
        info['apiRoot'].histogram = HistogramResource()

        events.bind('model.item.remove', 'Histogram', _onRemoveItem)
        events.bind('model.file.remove', 'Histogram', _onRemoveFile)
        events.bind('data.process', 'Histogram', _onUpload)
        events.bind('jobs.job.update.after', 'Histogram', _updateJob)
        events.bind('model.job.save', 'Histogram', _updateJob)
        events.bind('model.job.remove', 'Histogram', _updateJob)
