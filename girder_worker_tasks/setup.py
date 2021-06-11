from setuptools import setup

setup(name='histogram',
      version='0.1.0',
      description='A girder_worker extension for creating histogram',
      author='Kitware Inc.',
      author_email='kitware@kitware.com',
      license='Apache v2',
      classifiers=[
          'Development Status :: 2 - Pre-Alpha',
          'License :: OSI Approved :: Apache Software License'
          'Natural Language :: English',
          'Programming Language :: Python'
      ],
      entry_points={
          'girder_worker_plugins': [
              'histogram = histogram:HistogramGirderWorkerPlugin',
          ]
      },
      install_requires=[
          'girder_worker',
          'numpy',
      ],
      packages=['histogram'],
      zip_safe=False)
