const { BlobServiceClient } = require('@azure/storage-blob');
const mapLimit = require('async/mapLimit');
const debug = require('debug')('storage-azure');

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

/*
|--------------------------------------------------------------------------
| Private functions
|--------------------------------------------------------------------------
*/
async function _createContainerServiceClient(containerName) {
  const blobServiceClient = await BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  return blobServiceClient.getContainerClient(containerName);
}

async function _createBlockBlobServiceClient(containerName, blobName) {
  const containerClient = await _createContainerServiceClient(containerName);
  return containerClient.getBlockBlobClient(blobName);
}

/*
|--------------------------------------------------------------------------
| Public functions
|--------------------------------------------------------------------------
*/
async function uploadFile(filepath, containerName, uploadPath) {
  debug(`uploading file ${filepath} to ${uploadPath}`);
  return _createBlockBlobServiceClient(containerName, uploadPath).then((blockBlockClient) =>
    blockBlockClient.uploadFile(filepath)
  );
}

async function uploadFiles(filepaths, containerName, batchUploadLimit = 5, makeUploadPath) {
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING env variable.');
  }
  if (!makeUploadPath) {
    throw new Error('Missing function argument: `makeUploadPath`.');
  }

  return mapLimit(filepaths, batchUploadLimit, (filepath, callback) => {
    const uploadPath = makeUploadPath(filepath);
    if (!uploadPath) {
      callback(new Error(`missing upload path for file ${filepath}`));
      return;
    }
    uploadFile(filepath, containerName, uploadPath)
      .then((response) => {
        debug(`uploaded file to ${filepath} to ${uploadPath}`);
        callback(null, response);
      })
      .catch((e) => callback(e));
  });
}

module.exports = {
  uploadFile,
  uploadFiles
};
