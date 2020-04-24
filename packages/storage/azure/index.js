const { BlobServiceClient } = require('@azure/storage-blob');
const mapLimit = require('async/mapLimit');
const debug = require('debug')('storage-azure');
const { v4: uuidv4 } = require('uuid');

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

async function _createContainerServiceClient(containerName) {
  // Create the BlobServiceClient object which will be used to create a container client
  const blobServiceClient = await BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  // Get a reference to a container
  return blobServiceClient.getContainerClient(containerName);
}

async function _createBlockBlobServiceClient(containerName, blobName) {
  const containerClient = await _createContainerServiceClient(containerName);
  return containerClient.getBlockBlobClient(blobName);
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

    debug(`uploading file ${filepath} to ${uploadPath}`);
    _createBlockBlobServiceClient(containerName, uploadPath)
      .then((blockBlockClient) => blockBlockClient.uploadFile(filepath))
      .then((response) => {
        debug(`uploaded file to ${filepath} to ${uploadPath}`);
        callback(null, response);
      })
      .catch((e) => callback(e));
  });
}

module.exports = {
  uploadFiles
};
