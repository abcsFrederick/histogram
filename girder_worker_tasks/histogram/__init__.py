from girder_worker import GirderWorkerPluginABC


class HistogramGirderWorkerPlugin(GirderWorkerPluginABC):
    def __init__(self, app, *args, **kwargs):
        self.app = app

    def task_imports(self):
        # Return a list of python importable paths to the
        # plugin's path directory
        return [
            'histogram.histogram'
        ]