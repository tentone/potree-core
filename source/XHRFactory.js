/**
 * Migrated from Potree (https://github.com/potree/potree/blob/develop/src/XHRFactory.js) by Lars Moastuen <@larsmoa>.
 */
export const XHRFactory = {
	config: {
		withCredentials: false,
		customHeaders: [
			{ header: null, value: null }
		]
	},

	createXMLHttpRequest: function () {
		let xhr = new XMLHttpRequest();

		if (this.config.customHeaders &&
			Array.isArray(this.config.customHeaders) &&
			this.config.customHeaders.length > 0) {
			let baseOpen = xhr.open;
			let customHeaders = this.config.customHeaders;
			xhr.open = function () {
				baseOpen.apply(this, [].slice.call(arguments));
				customHeaders.forEach(function (customHeader) {
					if (!!customHeader.header && !!customHeader.value) {
						xhr.setRequestHeader(customHeader.header, customHeader.value);
					}
				});
			};
		}

		return xhr;
	},

	fetch: async function(resource) {
		const headers = new Headers();
		if (this.config.customHeaders) {
			this.config.customHeaders.forEach(function (customHeader) {
				if (!!customHeader.header && !!customHeader.value) {
					headers.append(customHeader.header, customHeader.value);
				}
			});
		}
		const options = {
			headers,
			credentials: XHRFactory.config.withCredentials ? 'include' : 'same-origin'
		};
		return fetch(resource, options);
	}
};
