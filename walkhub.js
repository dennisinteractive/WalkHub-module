// Add window.location.origin for browsers which doesn't support it.
if (!window.location.origin) {
  window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port: '');
}

(function ($) {

  var walkthroughOrigin;

  var MAXIMUM_ZINDEX = 2147483647;

  var csrf_token = null;

  var getdata = window.location.search.substr(1).split('&').reduce(function (obj, str) {
    str = str.split('=');
    obj[str.shift()] = str.join('=');
    return obj;
  }, {});

  function baseurl() {
    return window.location.protocol + '//' + window.location.hostname + ':' + window.location.port + Drupal.settings.basePath;
  }

  var iOS =
    navigator.platform === 'iPad' ||
    navigator.platform === 'iPad Simulator' ||
    navigator.platform === 'iPhone' ||
    navigator.platform === 'iPhone Simulator' ||
    navigator.platform === 'iPod';

  // @TODO convert these into proper objects. Remove the singleton state of methods.*.object.
  var methods = {
    iframe: {
      name: 'iFrame',
      linkcheck: false,
      execute: function (url) {
        var iframe = $('<iframe />')
          .attr('src', url)
          .attr('frameborder', 0)
          .attr('scrolling', 'auto')
          .attr('allowtransparency', 'true');

        methods.iframe.object = iframe;

        iframe
          .appendTo($('body'))
          .dialog({
            modal: true,
            autoOpen: true,
            draggable: false,
            resizable: false
          });

        var widget = iframe.dialog('widget');

        function resize() {
          var width = $(window).width() - 20;
          var height = $(window).height() - 20;

          // If full window is required.
          if ($('body').hasClass('walkthrough-full-window')) {
            width = $(window).width();
            height = $(window).height();
            // Hide dialog title.
            $('.ui-dialog-titlebar', widget).hide();
            // Make the dialog display in full window.
            widget.css('top', '0px');
            widget.css('bottom', '0px');
            widget.css('left', '0px');
            widget.css('right', '0px');
          }

          iframe.dialog('option', 'width', width);
          iframe.dialog('option', 'height', height);
          iframe.dialog('option', 'position', 'center');

          widget.css('padding', '0px');
          widget.css('margin', '0px');
          widget.css('border', 'none');

          iframe.css('width', width);
          iframe.css('height', height);
          iframe.css('position', 'center');
        }

        resize();

        window.addEventListener('resize', resize);

        iframe
          .parent()
            .css('z-index', MAXIMUM_ZINDEX);

        return iframe.get(0).contentWindow;
      },
      teardown: function () {
        if (methods.iframe.object) {
          methods.iframe.object.dialog('close');
          methods.iframe.object.remove();
        }
      },
      valid: true
    }
  };

  function getDefaultParameters(walkthroughlink) {
    var parameters = {};
    var data = walkthroughlink.data();
    var wtParamPrefix = jqCompat('1.6') ? 'walkthroughParameter' : 'walkthrough-parameter-';

    for (var k in data) {
      if (data.hasOwnProperty(k) && k.indexOf(wtParamPrefix) == 0) {
        var parameter = k.substr(wtParamPrefix.length).toLowerCase();
        var default_value = data[k];
        parameters[parameter] = getdata[parameter] || default_value;
      }
    }

    return parameters;
  }

  function jqCompat(version) {
    var jqversionparts = $.fn.jquery.split('.');
    var versionparts = version.split('.');
    for (var p in versionparts) {
      if (!versionparts.hasOwnProperty(p)) {
        continue;
      }
      if (versionparts[p] > (jqversionparts[p] || 0)) {
        return false;
      }
      if (versionparts[p] < (jqversionparts[p] || 0)) {
        return true;
      }
    }

    return true;
  }

  function createDialogForm(walkthroughlink, server, state) {
    var parameters = getDefaultParameters(walkthroughlink);
    var dialog = $('<div />')
      .attr('id', 'walkthrough-dialog-' + Math.random().toString())
      .attr('title', Drupal.t('Start Walkthrough'))
      .addClass('walkthrough-dialog')
      .hide()
      .append($('<form><fieldset></fieldset></form>'));

    var fieldset = dialog.find('fieldset');

    // Drupal.settings.walkhub.prerequisites stores walkthrough prerequisites.
    if (typeof Drupal.settings.walkhub != 'undefined' && typeof Drupal.settings.walkhub.prerequisites != 'undefined') {
      var basepath = baseurl();

      $('<p />')
          .html(Drupal.t('Before this Walkthrough can run you need to:'))
          .appendTo(fieldset);

      for (var key in Drupal.settings.walkhub.prerequisites) {
        if (Drupal.settings.walkhub.prerequisites.hasOwnProperty(key)) {
          var href = basepath + "node/" + Drupal.settings.walkhub.prerequisites[key]['nid'];
          $('<a href="' + href + '" target="_blank" class="button">' + Drupal.settings.walkhub.prerequisites[key]['title'] + '</a>').appendTo(fieldset);
        }
      }
    }

    $('<p />')
      .html(Drupal.t('The following parameters are available in this walkthrough:'))
      .appendTo(fieldset);

    for (var parameter in parameters) {
      if (!parameters.hasOwnProperty(parameter)) {
        continue;
      }
      $('<label/>')
        .attr('for', parameter)
        .html(parameter)
        .appendTo(fieldset);
      $('<input />')
        .attr('type', 'text')
        .attr('name', parameter)
        .attr('value', parameters[parameter])
        .attr('id', parameter)
        .addClass('text')
        .addClass('ui-widget-content')
        .addClass('ui-corner-all')
        .appendTo(fieldset);
    }

    var httpproxy = !!walkthroughlink.attr('data-walkthrough-proxy-url');

    $('<label />')
      .attr('for', 'sharelink')
      .html(Drupal.t('Share with these parameters: '))
      .appendTo(dialog.find('form'));

    var share = $('<textarea />')
      .attr('name', 'sharelink')
      .attr('readonly', 'readonly')
      .addClass('share')
      .appendTo(dialog.find('form'));

    var useproxy = null;
    if (httpproxy) {
      $('<label />')
        .attr('for', 'useproxy')
        .html(Drupal.t('Use proxy'))
        .appendTo(dialog.find('form'));
      useproxy = $('<input />')
        .attr('type', 'checkbox')
        .attr('name', 'useproxy')
        .attr('id', 'useproxy')
        .appendTo(dialog.find('form'));

      if (getdata['useproxy'] !== '0') {
        useproxy.attr('checked', 'checked');
      }
    }

    function updateParameters() {
      for (var k in parameters) {
        if (!parameters.hasOwnProperty(k)) {
          continue;
        }
        parameters[k] = $('input[name=' + k + ']', dialog).val();
      }
    }

    var buttons = {};
    buttons[Drupal.t('Start walkthrough')] = function () {
      updateParameters();
      if (httpproxy && !useproxy.is(':checked')) {
        state.HTTPProxyURL = null;
      }
      var method_name = $('input[name=method]:checked', dialog).val() || 'iframe';
      server.startWalkthrough(parameters, methods[method_name]);
      buttons[Drupal.t('Cancel')]();
    };
    buttons[Drupal.t('Cancel')] = function () {
      dialog.dialog('close');
      dialog.remove();
    };

    function regenLinks() {
      updateParameters();

      var link = window.location.origin + window.location.pathname + '?';
      for (var parameter in parameters) {
        if (!parameters.hasOwnProperty(parameter)) {
          continue;
        }
        link += parameter + '=' + encodeURIComponent(parameters[parameter]) + '&';
      }
      link = link.substr(0, link.length - 1);
      if (httpproxy) {
        link += '&useproxy=' + (useproxy.is(':checked') ? '1' : '0');
      }
      share.val(link + '&autostart=1');
    }

    regenLinks();

    $('input', dialog)
      .blur(regenLinks)
      .keyup(regenLinks)
      .click(regenLinks)
      .change(regenLinks)
      .blur();

    dialog.appendTo($('body'));
    dialog.dialog({
      autoOpen: true,
      modal: true,
      buttons: buttons,
      dialogClass: 'walkthrough-start-dialog',
      draggable: false,
      resizable: false
    });
  }

  function flagWalkthroughAsBroken() {
    $('span.flag-walkthrough-broken a.flag-action').click();
  }

  var errormessages_alter = {
    'command-not-supported': flagWalkthroughAsBroken,
    'locator-fail': function (msg) {
      var link = $('<a/>')
        .html(Drupal.t('Mark as broken'))
        .addClass('button')
        .addClass('markbroken')
        .click(function (event) {
          event.preventDefault();
          flagWalkthroughAsBroken();
        })
        .appendTo(msg);

      if (getdata['markbroken']) {
        link.click();
      }
    }
  };

  function showErrorMessage(id, error) {
    suppressErrorMessage(id);
    var msg = $('<div />')
      .attr('id', 'walkhub-error-message-' + id)
      .addClass('walkhub-error-message')
      .html(error)
      .appendTo($('span.ui-dialog-title', methods.iframe.object.parent()));

    if (errormessages_alter.hasOwnProperty(id)) {
      errormessages_alter[id](msg);
    }
  }

  function suppressErrorMessage(id) {
    $('#walkhub-error-message-' + id, methods.iframe.object.parent()).remove();
  }

  function WalkhubServer() {
    var key = Math.random().toString();

    var self = this;

    var currentURL = null;

    var state = {
      walkthrough: null,
      step: null,
      completed: false,
      stepIndex: 0,
      parameters: {},
      HTTPProxyURL: ''
    };

    var method;

    var finished = false;

    function maybeProxy(newdata, olddata) {
      if (olddata.proxy_key) {
        newdata.proxy_key = olddata.proxy_key;
      }
      return newdata;
    }

    var handlers = {
      connect: function (data, source) {
        walkthroughOrigin = data.origin;
        currentURL = data.url;
        post(maybeProxy({
          type: 'connect_ok',
          origin: window.location.origin,
          baseurl: baseurl(),
          key: key
        }, data), source);
      },
      request: function (data, source) {
        var request = function () {
          var opts = {
            url: data.URL,
            type: 'GET',
            success: function (respdata) {
              post(maybeProxy({
                ticket: data.ticket,
                type: 'success',
                data: respdata
              }, data), source);
            },
            error: function (xhr, status, err) {
              post(maybeProxy({
                ticket: data.ticket,
                type: 'error',
                error: err,
                status: status
              }, data), source);
            },
            dataType: 'json',
            accept: 'application/json',
            headers: {
              'X-CSRF-Token': csrf_token
            }
          };

          if (data.data) {
            opts.data = JSON.stringify(data.data);
            opts.contentType = 'application/json; charset=utf-8';
            opts.type = 'PUT';
          }

          $.ajax(opts);
        };
        if (!data.data || csrf_token) {
          request();
        } else {
          $.ajax({
            url: Drupal.settings.basePath + 'services/session/token',
            dataType: 'text',
            type: 'GET',
            success: function (data) {
              console.log('CSRF TOKEN: ' + data);
              csrf_token = data;
              request();
            }
          });
        }
      },
      getState: function (data, source) {
        post(maybeProxy({
          type: 'state',
          state: state
        }, data), source);
      },
      setState: function (data, source) {
        console.log("State updated", data.state);
        state = data.state;
      },
      log: function (data, source) {
        // TODO set a variable to enable/disable logging
        window.console && console.log && console.log('REMOTE LOG', data.log);
      },
      showError: function (data, source) {
        showErrorMessage(data.id, data.error);
      },
      suppressError: function (data, source) {
        suppressErrorMessage(data.id);
      },
      finished: function (data, source) {
        finished = true;
        method.teardown();
      },
      ping: function (data, source) {
        post({type: 'pong', tag: 'server'}, source, data.origin);
      }
    };

    handlers.connect.keyBypass = true;
    handlers.ping.keyBypass = true;

    function logMessage(msg, prefix) {
      if (msg.type && msg.type == 'log') {
        return;
      }
      console.log(prefix + "\t" + JSON.stringify(msg));
    }

    function post(message, source, origin) {
      if (source.postMessage) {
        logMessage(message, ">>");
        source.postMessage(JSON.stringify(message), origin || walkthroughOrigin);
      } else {
        window.console && console.log && console.log('Sending message failed.');
      }
    }

    window.addEventListener('message', function (event) {
      var data = JSON.parse(event.data);
      var handler = data && data.type && handlers[data.type];
      if (handler && (handler.keyBypass || (data.key && data.key == key))) {
        logMessage(data, "<<");
        handler(data, event.source);
      } else {
        console.log('Message discarded', event);
      }
    });

    this.clickEventHandler = function (event) {
      event.preventDefault();
      state.walkthrough = $(this).attr('data-walkthrough-uuid');
      state.HTTPProxyURL = $(this).attr('data-walkthrough-proxy-url');
      state.step = null;
      state.stepIndex = 0;
      state.parameters = {};
      state.completed = false;
      finished = false;
      currentURL = null;
      createDialogForm($(this), self, state);
    };

    this.startWalkthrough = function (parameters, wtmethod) {
      method = wtmethod;
      if (window.proxy) {
        window.proxy.pause();
        // TODO call window.proxy.resume() when the walkthrough finishes.
      }
      state.parameters = parameters;
      method.execute(currentURL || (baseurl() + 'walkhub'));
    };
  }

  Drupal.behaviors.walkhub = {
    attach: function (context) {
      $('.walkthrough-start:not(.walkhub-processed)', context)
        .addClass('walkhub-processed')
        .each(function () {
          var appserver = new WalkhubServer();
          $(this).click(appserver.clickEventHandler);
          if (getdata.autostart) {
            $(this).click();
          }
        });
    }
  };
})(jQuery);
