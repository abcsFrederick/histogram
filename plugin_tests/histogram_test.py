#!/usr/bin/env python
# -*- coding: utf-8 -*-

#############################################################################
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
#############################################################################

import json
import os
import time

from bson.objectid import ObjectId

from tests import base

from girder import config
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.token import Token
from girder.models.user import User


os.environ['GIRDER_PORT'] = os.environ.get('GIRDER_TEST_PORT', '20200')
config.loadConfig()  # Must reload config to pickup correct port


def setUpModule():
    base.enabledPlugins.append('histogram')
    base.startServer(False)


def tearDownModule():
    base.stopServer()


class HistogramTest(base.TestCase):
    def setUp(self, *args, **kwargs):
        base.TestCase.setUp(self, *args, **kwargs)
        admin = {
            'email': 'admin@email.com',
            'login': 'adminlogin',
            'firstName': 'Admin',
            'lastName': 'Last',
            'password': 'adminpassword',
            'admin': True
        }
        self.admin = User().createUser(**admin)
        user = {
            'email': 'user@email.com',
            'login': 'userlogin',
            'firstName': 'Common',
            'lastName': 'User',
            'password': 'userpassword'
        }
        self.user = User().createUser(**user)
        folders = Folder().childFolders(self.user, 'user', user=self.admin)
        for folder in folders:
            if folder['name'] == 'Private':
                self.userPrivateFolder = folder
        folders = Folder().childFolders(self.admin, 'user', user=self.admin)
        for folder in folders:
            if folder['name'] == 'Public':
                self.publicFolder = folder
            if folder['name'] == 'Private':
                self.privateFolder = folder
        girder_port = os.environ['GIRDER_PORT']
        resp = self.request(
            '/system/setting', method='PUT', user=self.admin, params={
                'list': json.dumps([{
                    'key': 'worker.broker',
                    'value': 'amqp://guest@127.0.0.1/'
                }, {
                    'key': 'worker.backend',
                    'value': 'amqp://guest@127.0.0.1/'
                }, {
                    'key': 'worker.api_url',
                    'value': 'http://127.0.0.1:%s/api/v1' % girder_port
                }])})
        self.assertStatusOk(resp)

    def _uploadFile(self, path, name=None, private=False):
        """
        Upload the specified path to the admin user's public or private folder
        and return the resulting item.

        :param path: path to upload.
        :param name: optional name for the file.
        :param private: True to upload to the private folder, False for public.
            'user' for the user's private folder.
        :returns: file: the created file.
        """
        if not name:
            name = os.path.basename(path)
        with open(path, 'rb') as file:
            data = file.read()
        if private == 'user':
            folderId = self.userPrivateFolder['_id']
        elif private:
            folderId = self.privateFolder['_id']
        else:
            folderId = self.publicFolder['_id']
        resp = self.request(
            path='/file', method='POST', user=self.admin, params={
                'parentType': 'folder',
                'parentId': folderId,
                'name': name,
                'size': len(data)
            })
        self.assertStatusOk(resp)
        uploadId = resp.json['_id']

        fields = [('offset', 0), ('uploadId', uploadId)]
        files = [('chunk', name, data)]
        resp = self.multipartRequest(
            path='/file/chunk', fields=fields, files=files, user=self.admin)
        self.assertStatusOk(resp)
        self.assertIn('itemId', resp.json)
        file = File().load(resp.json['_id'], user=self.admin, exc=True)
        item = Item().load(file['itemId'], user=self.admin, exc=True)
        return file, item

    def _createHistogramJob(self, **kwargs):
        from girder.plugins.jobs.models.job import Job
        from girder.plugins.jobs.constants import JobStatus
        from girder.plugins.histogram.models.histogram import Histogram

        file, item = self._uploadFile('plugins/large_image/plugin_tests/test_files/test_L_8.png')

        token = Token().createToken(self.admin)

        doc = Histogram().createHistogramJob(item, file, user=self.admin,
                                             token=token, **kwargs)

        complete = (JobStatus.SUCCESS, JobStatus.ERROR, JobStatus.CANCELED)
        starttime = time.time()
        while True:
            self.assertTrue(time.time() - starttime < 30)
            job = Job().load(doc['_id'], user=self.admin, exc=True)
            if job.get('status') in complete:
                break
            time.sleep(0.1)
        if job.get('log'):
            print(job.get('log'))
        assert job.get('status') == JobStatus.SUCCESS

        return ObjectId(job['_id'])

    def _loadHistogram(self, jobId):
        from girder.plugins.histogram.models.histogram import Histogram
        histograms = list(Histogram().find({'jobId': jobId}, limit=2))
        assert len(histograms) == 1
        return histograms[0]

    def _loadHistogramFile(self, histogram):
        file = File().load(histogram['fileId'], user=self.admin, exc=True)
        assert file
        return json.load(File().open(file))

    def testHistogramCreateJob(self):
        jobId = self._createHistogramJob()
        histogram = self._loadHistogram(jobId)
        assert self._loadHistogramFile(histogram)

    def testHistogramCreateJobValidation(self):
        from girder.plugins.histogram.models.histogram import Histogram

        file1, _ = self._uploadFile('plugins/large_image/plugin_tests/test_files/test_L_8.png')
        _, item2 = self._uploadFile('plugins/large_image/plugin_tests/test_files/test_L_8.png')
        token = Token().createToken(self.admin)
        with self.assertRaises(ValueError) as context:
            Histogram().createHistogramJob(item2, file1, user=self.admin,
                                           token=token)
        self.assertTrue('The file must be in the item.' in
                        str(context.exception))

    def testHistogramRemove(self):
        from girder.plugins.histogram.models.histogram import Histogram
        jobId = self._createHistogramJob()
        histogram = self._loadHistogram(jobId)
        assert histogram is not None
        fileId = histogram.get('fileId')
        Histogram().remove(histogram)
        assert File().load(fileId, force=True) is None

    def testHistogramFileRemove(self):
        from girder.plugins.histogram.models.histogram import Histogram
        jobId = self._createHistogramJob()
        histogram = self._loadHistogram(jobId)
        assert histogram is not None
        histogramId = histogram['_id']
        fileId = histogram.get('fileId')
        file = File().load(fileId, force=True)
        assert File is not None
        File().remove(file)
        assert Histogram().load(histogramId, force=True) is None

    def testItemHistogramRemove(self):
        from girder.plugins.histogram.models.histogram import Histogram
        jobId = self._createHistogramJob()
        histogram = self._loadHistogram(jobId)
        assert histogram is not None
        histogramId = histogram['_id']
        itemId = histogram.get('itemId')
        fileId = histogram.get('fileId')
        item = Item().load(itemId, force=True)
        assert item is not None
        Item().remove(item)
        assert Histogram().load(histogramId, force=True) is None
        assert File().load(fileId, force=True) is None
